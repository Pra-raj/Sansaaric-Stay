# Recommendation System — Design Plan

Hybrid content + collaborative ranking for hotel discovery. No new models, no
migrations: every signal is derived at request time from `hotels`, `rooms`,
`bookings` and `reviews`.

## Goals

Serve three surfaces from one ranking engine:

| Surface | Endpoint |
|---|---|
| Home page "Top Recommended" | `GET /api/recommendations` |
| "Similar stays" on a hotel page | `GET /api/recommendations/similar/<int:hotel_id>` |
| Search result re-ranking | `GET /api/hotels?sort=recommended` |

## Constraints discovered during design

These drove several decisions and should not be "fixed" by reverting the code:

1. **`Hotel.avg_rating` is never written by anything.** No `post_save` /
    `post_delete` signals exist anywhere in the backend, so the denormalized
    field drifts out of date immediately. We compute `Avg("reviews__rating")`
    live and only fall back to `avg_rating` for hotels with zero reviews.
2. **No availability logic exists.** `Room.total_units` is never compared
    against overlapping bookings, and `BookingCreateSerializer` performs no
    overlap check. Recommending a sold-out property is a real risk, so
    `availability.py` adds a read-only capacity filter.
3. **pgvector and `embed_texts()` (384-d) already exist** from the document RAG
    pipeline, and were deliberately *not* used here. Embedding hotel text would
    add per-request latency and make ranking non-deterministic across model
    versions; deterministic numeric scoring is fully unit-testable.
4. **`visible_hotel_list(user)` already encodes the draft / archived /
    owner-only visibility rules.** Every entry point reuses it, so no code path
    can leak an unpublished hotel.

## Architecture

```
GET /api/recommendations              -> profiles.build(user)
                                     -> signals.hotel_features(queryset)
                                     -> scoring.blend(features, profile)
                                     -> top N
GET /api/recommendations/similar/<id> -> scoring.similar(features, seed)
                                     -> top N
GET /api/hotels?sort=recommended     -> re-rank the visible result set in place
```

### Signal 1 — Content (`scoring.content_score`)

Cosine-style similarity between the user's taste vector and each hotel's
feature vector. Hotel features, all extracted in a single batched query:

| Feature | Source | Notes |
|---|---|---|
| `property_type` | `Hotel.property_type` | categorical |
| `region` | `Location.region` | categorical, coarser than city |
| `distance_km` | `Location.latitude/longitude` | haversine, `None` if either coord missing |
| `price` | `Min("rooms__base_price")` | `None` when the hotel has no rooms |
| `max_guests` | `Max("rooms__max_guests")` | `None` when the hotel has no rooms |
| `bayesian_rating` | `Avg` + `Count` on `reviews` | prior `RATING_PRIOR` = 3.5 |

Rating is **Bayesian**, not raw: a single 5-star review would otherwise outrank
a 4.6-star hotel with 200 reviews.

```python
bayesian = (C * prior + sum_ratings) / (C + review_count)
```

Hotels with no reviews fall back to `Hotel.avg_rating`, and if that is `0` they
inherit the prior — treated as "unknown", never as "bad".

### Signal 2 — Collaborative (`scoring.cf_score`)

Item-item co-occurrence: hotels touched by people who touched *your* hotels.
Chosen over user-user cosine because it tolerates far sparser data, and because
the same function powers "similar stays" (where the seed hotel plays the role of
"you").

Each interaction carries a weight and a sign:

| Interaction | Weight |
|---|---|
| `completed` booking | 1.0 |
| `confirmed` booking | 0.8 |
| `pending` booking | 0.4 |
| `cancelled` booking | 0.1 (still a weak signal — they looked) |
| review, rating 4-5 | 1.0 |
| review, rating 3 | 0.3 |
| review, rating 2 | -0.8 |
| review, rating 1 | -1.2 |

A one-star review is deliberately heavy enough to **outweigh the completed
booking it sits on**. A guest who was burned must stop being treated as an
advocate for that property's peers; with symmetric weights the booking always
won and the negative signal could never take effect, making the "no promotion
for universally disliked peers" branch unreachable in practice.

`cf_score` is normalized to `0..1` across the candidate set via min-max, so the
blend weights stay meaningful regardless of raw co-occurrence magnitude. When
the best raw score is non-positive the scale collapses to zero rather than
min-maxing a fully negative set up to 1.

**Two-stage neighbour lookup** (`_peer_histories`). Scoring a *candidate* needs
each neighbour's affinity for that candidate, which means their **whole**
history, not just the slice at your hotels:

1. Find users who shared a hotel with you, weighted by overlap mass.
2. Cap that pool at `PEER_POOL` (200), then fetch their full interaction sets.
3. Cosine similarity on the seed overlap, keep the top `MAX_PEERS` (50), and
   accumulate `similarity x neighbour_weight` per candidate.

Collecting only seed interactions — the obvious implementation — makes every
candidate score exactly zero, because candidates are by definition hotels you
have not visited. The cap on stage 2 exists because that query runs over entire
histories, and an uncapped pool on a popular hotel would pull an unreasonable
number of rows.

### Blending and cold start (`scoring.blend`)

```python
final = (1 - w) * content + w * cf
w     = CF_WEIGHT * min(1.0, interactions / COLD_START_MIN_INTERACTIONS)
```

CF weight ramps linearly from 0 as a user accumulates interactions. A user with
no history receives pure content/popularity ranking and a non-empty result list,
never an error or an arbitrary ordering. The `cold_start` and `strategy` fields
in the API response make this fallback observable rather than silent: `strategy`
reports `popular` during cold start, because with one booking in the history the
blend is still overwhelmingly content-driven and claiming "personalized" would
overstate what the caller actually got.

### Popularity fallback (anonymous visitors)

No profile exists, so ranking is Bayesian quality weighted by review volume,
with a mild recency nudge for `created_at`.

### Determinism

Every ordering ends with an explicit `(-score, -id)` tie-break. Without this,
hotels with identical scores can swap places between requests, which makes
pagination unstable and tests flaky.

## Module layout

```
recommendations/
├── plan.md            # this document
├── apps.py            # RecommendationsConfig
├── signals.py         # batched hotel feature extraction
├── profiles.py        # user taste vector from Booking + Review
├── scoring.py         # content_score / cf_score / blend / similar
├── availability.py    # capacity vs overlapping bookings
├── cache.py           # TTL cache, mirrors chat/services.py
├── serializers.py     # recommendation response + hotel summary reuse
├── views.py           # the two endpoints
├── urls.py
└── tests.py
```

Modified files: `config/settings.py` (`RECOMMENDATIONS` block, `INSTALLED_APPS`,
`recommendations` logger), `config/urls.py`, `hotels/views.py` (`sort` param).

Deliberately **absent**: `models.py` and `migrations/`. Nothing is persisted, so
there is no stale-cache-from-a-dropped-column class of bug.

## Endpoint contracts

### `GET /api/recommendations`

Public. Authenticated requests are personalized.

| Param | Default | Notes |
|---|---|---|
| `limit` | 8 | clamped to `MAX_LIMIT` (50); non-integer -> 400 |
| `exclude` | — | comma-separated hotel ids to drop |
| `check_in` / `check_out` | — | ISO dates; both or neither, else 400 |
| `guests` | — | positive int; requires dates, else 400 |

```json
{
  "results": [ /* HotelSummarySerializer */ ],
  "strategy": "personalized",
  "cold_start": false
}
```

`strategy` is `personalized` for an authenticated user with enough history,
`popular` for anonymous visitors and cold-start users. Returning it lets the
frontend label the section honestly ("Handpicked for you" vs "Popular right
now") instead of asserting personalization it did not receive.

### `GET /api/recommendations/similar/<int:hotel_id>`

Public. 404 when the seed hotel is not visible to the caller (same rule as
`visible_hotel_or_404`). Always excludes the seed hotel from its own results.

### `GET /api/hotels?sort=recommended`

Re-ranks the visible result set in place, before pagination, so `count` and
paging stay consistent. `sort=rating` and `sort=price` are also accepted;
`price` sorts on `Min("rooms__base_price")`. An unknown `sort` value is ignored
and falls back to the existing `-created_at` ordering.

Translating a ranked list back into SQL order needs one `CASE`/`WHEN` clause per
hotel, which is fine for a normal catalogue but produces a pathological statement
for a very large one. Above `MAX_RANK_CLAUSES` (1000) the re-rank is skipped,
the default ordering is used, and the situation is logged — a slow endpoint is
better than a failed one.

## Caching

Process-local TTL cache with a lock and a max entry count, mirroring
`chat/services.py:285-320` (30-minute TTL for answers; 5 minutes here since
hotels change more often). Keyed on `(user_id, limit, exclude, dates, guests)`.
Anonymous requests share one key so a bot loop cannot fragment the cache.

Not shared across processes — harmless to disable, and a natural upgrade path to
Redis later. Reviews and bookings mutate rarely, so staleness is bounded and
the TTL is short.

## Testing strategy

`django.test.TestCase` + `rest_framework.test.APIClient`, matching
`reviews/tests.py` exactly — no factories, no mocks of external services.

- **Content**: same property type outranks different; same region outranks
  different; nearer outranks further; larger party matches larger capacity.
- **Bayesian rating**: a 5.0/1-review hotel must not outrank a 4.6/50-review
  hotel; zero-review hotels must not be treated as worst.
- **CF**: a hotel co-stayed by the user's peers outranks one that is not;
  negative reviews push peers down.
- **Cold start**: a user with no history gets HTTP 200, a non-empty list, and
  `cold_start: true` — never a 500.
- **Visibility**: anonymous never sees draft or archived; the owner sees their
  own draft; similar-stays 404s on an invisible seed.
- **Contract**: `limit` clamping, non-integer `limit` -> 400, `exclude` applied,
  date/guest param validation, availability filtering.
- **Determinism**: two identical calls return identical orderings.
- **Regression**: `sort=recommended` re-ranks without breaking `count`,
  pagination, or the default ordering.

Run against a pgvector Postgres per the README command:

```bash
SUPABASE_DB_HOST=127.0.0.1 SUPABASE_DB_PORT=5432 \
SUPABASE_DB_USER=postgres SUPABASE_DB_PASSWORD=postgres \
SUPABASE_DB_SSLMODE=prefer python manage.py test recommendations
```

## Tuning

All weights live in the `RECOMMENDATIONS` dict in `config/settings.py`, so they
are overridable per environment without touching code. They are deliberately
conservative and defensible rather than empirically tuned — there is not yet an
impression or click dataset to tune against.

## Known follow-ups (not in scope)

1. **The frontend will not benefit yet.** `SearchExperience.tsx` filters and
   sorts client-side over `dummyHotels`, and the hand-written frontend `Hotel`
   type does not match `HotelSummarySerializer` (it expects `location: string`,
   `propertyType`, `startingPrice`; the API returns `location` as a nested
   object and has no `propertyType`/`startingPrice`). Backend-only delivery
   means the endpoint is correct but unexercised.
2. **`Hotel.avg_rating` remains unwritten.** We route around it, but it will stay
   wrong. A `post_save`/`post_delete` signal on `Review` maintaining it is a
   small, self-contained fix.
3. **No offline evaluation harness.** Tuning is by inspection until impression
   and click events are recorded, which needs a tracking model.