"""Ranking maths for hotel recommendations.

Three signals, all normalized to ``0..1`` so the blend weights in settings stay
interpretable regardless of the raw magnitude of any one of them:

``content_score``
    Similarity between the user's taste profile and a hotel's features.
``collaborative_scores``
    Item-item co-occurrence: hotels touched by people who touched *your* hotels.
``popularity_score``
    Bayesian quality weighted by review volume. The anonymous fallback.

Collaborative weight ramps linearly from zero with interaction count, so a
visitor with no history still receives a sensible, non-empty, deterministic
ranking instead of an arbitrary one.
"""
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone

from django.conf import settings

from . import profiles as profiles_module
from .signals import GEO_FLOOR_KM, HotelFeatures

logger = logging.getLogger(__name__)

# Peer users considered per request. Cosine over the interaction sets is cheap,
# but a platform with heavy traffic can accumulate a lot of peers and the tail
# contributes almost nothing once similarity decays.
MAX_PEERS = 50

# Upper bound on neighbours whose *full* history is fetched. Kept above
# MAX_PEERS because the history query runs before similarity ranking.
PEER_POOL = 200

# Split of "similar stays" between content fit and co-stay evidence.
SIMILAR_CONTENT_WEIGHT = 0.6
SIMILAR_CF_WEIGHT = 0.4

# Newer properties get a small nudge so fresh inventory can surface in an
# otherwise tie-heavy popularity ranking.
RECENCY_WEIGHT = 0.1


@dataclass(frozen=True)
class ScoredHotel:
    """A hotel with its component scores, for debugging and API transparency."""

    hotel_id: int
    score: float
    content: float
    collaborative: float


def config() -> dict:
    """Tuning parameters, overridable per environment via settings."""
    return getattr(settings, "RECOMMENDATIONS", {})


def _single_affinity(value) -> dict[str, float]:
    """A one-hot distribution, used when a seed hotel stands in for a profile."""
    return {value: 1.0} if value else {}


def _affinity(hotel_value, distribution) -> float | None:
    """Normalize a categorical affinity to 0..1 against the user's top value."""
    if not distribution or not hotel_value:
        return None
    top = max(distribution.values())
    if top <= 0:
        return None
    return distribution.get(hotel_value, 0.0) / top


def _geo_similarity(hotel: HotelFeatures, profile) -> float | None:
    if profile.latitude is None or profile.longitude is None:
        return None
    distance = hotel.distance_km(profile.latitude, profile.longitude)
    if distance is None:
        return None
    return max(0.0, 1.0 - min(distance, GEO_FLOOR_KM) / GEO_FLOOR_KM)


def _price_similarity(hotel: HotelFeatures, profile) -> float | None:
    if hotel.price is None or not profile.mean_price or profile.mean_price <= 0:
        return None
    # Log scale: a guest who typically pays 3000 should not be punished as hard
    # for a 1200 room as for a 300 room.
    ratio = hotel.price / profile.mean_price
    return 1.0 - min(abs(math.log(max(ratio, 1e-6))), 1.0)


def _capacity_similarity(hotel: HotelFeatures, profile) -> float | None:
    if hotel.max_guests is None or not profile.mean_guests:
        return None
    if hotel.max_guests >= profile.mean_guests:
        return 1.0
    # Partial credit rather than a hard zero: a 2-person room for a guest who
    # usually brings 4 is a worse match, not a disqualified one.
    return hotel.max_guests / profile.mean_guests


def content_score(hotel: HotelFeatures, profile, cfg: dict) -> float:
    """Weighted similarity between one hotel and a user's taste profile.

    Components whose inputs are missing are dropped from *both* the numerator
    and the denominator, so a hotel is never punished for lacking data the
    profile itself did not provide.
    """
    components: list[tuple[float, float]] = []

    def add(weight_key, value):
        if value is None:
            return
        weight = cfg.get(weight_key, 0.0)
        if weight > 0:
            components.append((weight, max(0.0, min(1.0, value))))

    add("PROPERTY_TYPE_WEIGHT", _affinity(hotel.property_type, profile.property_types))
    add("REGION_WEIGHT", _affinity(hotel.region, profile.regions))
    add("GEO_WEIGHT", _geo_similarity(hotel, profile))
    add("PRICE_WEIGHT", _price_similarity(hotel, profile))
    add("CAPACITY_WEIGHT", _capacity_similarity(hotel, profile))
    add("QUALITY_WEIGHT", max(0.0, min(1.0, (hotel.bayesian_rating - 1.0) / 4.0)))

    total_weight = sum(weight for weight, _ in components)
    if total_weight <= 0:
        return 0.0
    return sum(weight * value for weight, value in components) / total_weight


def popularity_score(hotel: HotelFeatures, cfg: dict) -> float:
    """Quality weighted by evidence volume, used when there is no profile."""
    prior = cfg.get("RATING_PRIOR", 3.5)
    span = max(1e-6, 5.0 - prior)
    quality = max(0.0, min(1.0, (hotel.bayesian_rating - prior) / span))
    # log1p keeps a 5000-review property from burying everything, while still
    # rewarding volume.
    evidence = math.log1p(hotel.review_count) / math.log1p(1000.0)
    popularity_weight = cfg.get("POPULARITY_WEIGHT", 0.6)
    return (1.0 - popularity_weight) * quality + popularity_weight * evidence


def _recency_boost(hotel: HotelFeatures) -> float:
    """Mild preference for newer properties, halved every year."""
    created = hotel.created_at
    if created is None:
        return 0.0
    if created.tzinfo is None:
        created = created.replace(tzinfo=dt_timezone.utc)
    age_days = max(
        0.0, (datetime.now(dt_timezone.utc) - created).total_seconds() / 86400.0
    )
    return math.pow(0.5, age_days / 365.0)


def _peer_histories(
    user_id: int | None, seed_ids: list[int], user_history: dict[int, float]
) -> dict[int, dict[int, float]]:
    """Find users who shared a hotel with ``user``, then fetch their full histories.

    Two stages, and the second one is essential: to score a *candidate* hotel we
    need each neighbour's affinity for that candidate, which means their whole
    history — not just the slice at the seed hotels. Collecting only seed
    interactions makes every candidate score zero, because candidates are by
    definition hotels the user has not visited.

    Returns ``{peer_user_id: {hotel_id: signed_weight}}`` for the neighbours that
    share the most weight with the user.
    """
    if not seed_ids or not user_history:
        return {}

    from bookings.models import Booking
    from reviews.models import Review

    overlap: dict[int, float] = {}

    def bump(peer_id, weight):
        overlap[peer_id] = overlap.get(peer_id, 0.0) + weight

    bookings = Booking.objects.filter(room__hotel_id__in=seed_ids)
    reviews = Review.objects.filter(hotel_id__in=seed_ids)
    if user_id is not None:
        bookings = bookings.exclude(user_id=user_id)
        reviews = reviews.exclude(user_id=user_id)

    for peer_id, _hotel_id, status in bookings.values_list(
        "user_id", "room__hotel_id", "status"
    ):
        bump(peer_id, profiles_module.BOOKING_WEIGHTS.get(status, 0.5))

    for peer_id, _hotel_id, rating in reviews.values_list(
        "user_id", "hotel_id", "rating"
    ):
        bump(peer_id, profiles_module.REVIEW_WEIGHTS.get(rating, 1.0))

    # Cap the neighbour pool before the second query: the follow-up fetch is
    # over whole histories, so an unbounded pool on a popular hotel would pull
    # an unreasonable number of rows.
    strongest = sorted(overlap.items(), key=lambda item: (-item[1], item[0]))
    peer_ids = [peer_id for peer_id, _weight in strongest[:PEER_POOL]]
    if not peer_ids:
        return {}

    histories: dict[int, dict[int, float]] = {peer_id: {} for peer_id in peer_ids}

    def add(peer_id, hotel_id, weight):
        bucket = histories[peer_id]
        bucket[hotel_id] = bucket.get(hotel_id, 0.0) + weight

    for peer_id, hotel_id, status in Booking.objects.filter(
        user_id__in=peer_ids
    ).values_list("user_id", "room__hotel_id", "status"):
        add(peer_id, hotel_id, profiles_module.BOOKING_WEIGHTS.get(status, 0.5))

    for peer_id, hotel_id, rating in Review.objects.filter(
        user_id__in=peer_ids
    ).values_list("user_id", "hotel_id", "rating"):
        add(peer_id, hotel_id, profiles_module.REVIEW_WEIGHTS.get(rating, 1.0))

    return histories


def _cosine(left: dict[int, float], right: dict[int, float]) -> float:
    if not left or not right:
        return 0.0
    shared = set(left) & set(right)
    if not shared:
        return 0.0
    dot = sum(left[key] * right[key] for key in shared)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm <= 0 or right_norm <= 0:
        return 0.0
    return dot / (left_norm * right_norm)


def collaborative_scores(
    features: dict[int, HotelFeatures],
    history: dict[int, float],
    user_id: int | None = None,
) -> dict[int, float]:
    """Item-item co-occurrence scores in ``0..1`` for every candidate hotel."""
    if not history:
        return {}

    peers = _peer_histories(user_id, list(history), history)
    if not peers:
        return {}

    similarities = [
        (peer_id, _cosine(history, peer_history))
        for peer_id, peer_history in peers.items()
    ]
    positive = sorted(
        (item for item in similarities if item[1] > 0),
        key=lambda item: (-item[1], item[0]),
    )[:MAX_PEERS]
    if not positive:
        return {}

    raw: dict[int, float] = {}
    for peer_id, similarity in positive:
        for hotel_id, weight in peers[peer_id].items():
            if hotel_id in features:
                raw[hotel_id] = raw.get(hotel_id, 0.0) + similarity * weight

    if not raw:
        return {}

    # A user whose every peer experience was negative should have *nothing*
    # promoted, so the scale collapses to zero when the best raw score is
    # non-positive rather than min-maxing a fully negative set up to 1.
    best = max(raw.values())
    if best <= 0:
        return {}

    worst = min(raw.values())
    spread = best - worst
    if spread <= 0:
        return {hotel_id: 1.0 for hotel_id in raw}
    return {hotel_id: (value - worst) / spread for hotel_id, value in raw.items()}


def _cf_weight(profile, cfg: dict) -> float:
    """Ramp collaborative influence in from zero as history accumulates."""
    max_weight = cfg.get("CF_WEIGHT", 0.4)
    needed = cfg.get("COLD_START_MIN_INTERACTIONS", 3)
    if needed <= 0:
        return max_weight
    return max_weight * min(1.0, profile.interaction_count / needed)


def rank(
    features: dict[int, HotelFeatures],
    profile,
    cfg: dict | None = None,
    exclude: set[int] | None = None,
) -> list[ScoredHotel]:
    """Score and order candidates for a user, or anonymously when profile is empty."""
    cfg = cfg or config()
    exclude = exclude or set()

    candidates = {
        hotel_id: hotel
        for hotel_id, hotel in features.items()
        # A hotel with no rooms cannot be booked, so it should never be a pick.
        if hotel.room_count > 0 and hotel_id not in exclude
    }
    if not candidates:
        return []

    scored: list[ScoredHotel] = []

    if profile.is_empty:
        for hotel_id, hotel in candidates.items():
            popularity = popularity_score(hotel, cfg)
            scored.append(
                ScoredHotel(
                    hotel_id=hotel_id,
                    score=popularity + _recency_boost(hotel) * RECENCY_WEIGHT,
                    content=popularity,
                    collaborative=0.0,
                )
            )
    else:
        collaborative = collaborative_scores(
            candidates, profile.interactions, profile.user_id
        )
        weight = _cf_weight(profile, cfg)
        for hotel_id, hotel in candidates.items():
            content = content_score(hotel, profile, cfg)
            cf = collaborative.get(hotel_id, 0.0) if weight > 0 else 0.0
            scored.append(
                ScoredHotel(
                    hotel_id=hotel_id,
                    score=(1.0 - weight) * content + weight * cf,
                    content=content,
                    collaborative=cf,
                )
            )

    scored.sort(key=lambda item: (-item.score, -item.hotel_id))
    return scored


def similar(
    features: dict[int, HotelFeatures],
    seed_id: int,
    cfg: dict | None = None,
    user_id: int | None = None,
) -> list[ScoredHotel]:
    """Rank hotels similar to ``seed_id`` by co-stay evidence plus content fit.

    The seed is turned into a synthetic one-hot history so the same item-item
    machinery serves both surfaces: "your hotels" and "this hotel" are the same
    query with a different seed. ``user_id`` is the caller, excluded from the
    neighbour set so they are not treated as evidence about themselves.
    """
    cfg = cfg or config()
    seed = features.get(seed_id)
    if seed is None:
        return []

    candidates = {
        hotel_id: hotel for hotel_id, hotel in features.items() if hotel_id != seed_id
    }
    if not candidates:
        return []

    seed_profile = profiles_module.TasteProfile(
        property_types=_single_affinity(seed.property_type),
        regions=_single_affinity(seed.region),
        latitude=seed.latitude,
        longitude=seed.longitude,
        mean_price=seed.price,
        mean_guests=float(seed.max_guests) if seed.max_guests else None,
        interactions={seed_id: 1.0},
        interaction_count=1,
    )

    collaborative = collaborative_scores(candidates, {seed_id: 1.0}, user_id)
    scored = []
    for hotel_id, hotel in candidates.items():
        content = content_score(hotel, seed_profile, cfg)
        cf = collaborative.get(hotel_id, 0.0)
        scored.append(
            ScoredHotel(
                hotel_id=hotel_id,
                score=SIMILAR_CONTENT_WEIGHT * content
                + SIMILAR_CF_WEIGHT * cf,
                content=content,
                collaborative=cf,
            )
        )

    scored.sort(key=lambda item: (-item.score, -item.hotel_id))
    return scored


def build_profile(user) -> profiles_module.TasteProfile:
    """Build a :class:`~recommendations.profiles.TasteProfile` with configured decay."""
    return profiles_module.build_profile(
        user, half_life_days=config().get("RECENCY_HALF_LIFE_DAYS", 180.0)
    )


def strategy_for(profile) -> str:
    """Human-readable label describing which ranking path produced a result.

    Deliberately reports ``popular`` during cold start: with one booking in the
    history the blend is still overwhelmingly content-driven, and telling a
    client "personalized" there would overstate what the user actually got.
    """
    if is_cold_start(profile):
        return "popular"
    return "personalized"


def is_cold_start(profile) -> bool:
    """True when the user has history but not enough to trust CF yet."""
    if profile.is_empty:
        return True
    needed = config().get("COLD_START_MIN_INTERACTIONS", 3)
    return profile.interaction_count < needed