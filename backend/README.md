# Sansaaric Stay — Backend

Django + pgvector RAG backend for the Sansaaric Stay assistant. Upload documents
(PDF / DOCX / TXT / Markdown / CSV / Excel), train them into embeddings, and get
grounded, cited answers via a Groq LLM with Cohere reranking.

## Architecture at a glance

```
upload (admin app) ──►  document_ingestion  ──► chunks + embeddings (pgvector)
                        │
chat (web + API)   ──►  retrieve: hybrid (pgvector + full-text) search
                        ├─ reformulate question (LLM, if history)
                        ├─ embed query (all-MiniLM-L6-v2)
                        ├─ hybrid search ──► RRF fusion ──► Cohere rerank
                        └─ answer: Groq LLM with numbered sources + citations
```

- **Database:** Supabase PostgreSQL with the `pgvector` extension.
- **Storage:** Supabase S3-compatible bucket (`document`), wired through `django-storages`.
- **Worker:** document training runs in an **in-process polling worker inside
  every served web process** (disable with `INGESTION_EMBEDDED_WORKER=0`), or in
  a dedicated `python manage.py trainworker` process. Workers claim documents
  atomically (`FOR UPDATE SKIP LOCKED`) with a crash-safe heartbeat — no
  Celery/qcluster/broker required. A crashed worker's orphaned `processing`
  documents are reclaimed once their heartbeat goes stale.
- **Models:** `ReferenceDocument` + `Chunk` (embedding `vector(384)`, HNSW index, full-text index), `Conversation` + `Message` (with citations).

---

## Prerequisites

- Python **3.11+** (`.python-version` pins 3.11)
- A Supabase project with:
  - Postgres + **pgvector** enabled
  - An S3-compatible storage bucket (name defaults to `document`)
  - API keys for S3 (project-level storage keys)
- API keys for **Groq** and **Cohere**
- System libraries for document parsing:

```bash
# Debian / Ubuntu
sudo apt-get install -y libmagic1 poppler-utils tesseract-ocr
```

## 1. Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | yes | Django secret key |
| `DJANGO_DEBUG` | no | `true` for dev (default) |
| `DJANGO_ALLOWED_HOSTS` | no | Comma-separated hosts (default `localhost,127.0.0.1`) |
| `SUPABASE_DB_HOST` | yes | Supabase Postgres host (e.g. `db.<ref>.supabase.co`) |
| `SUPABASE_DB_PORT` | no | Default `5432` |
| `SUPABASE_DB_NAME` | no | Default `postgres` |
| `SUPABASE_DB_USER` | yes | DB user |
| `SUPABASE_DB_PASSWORD` | yes | DB password |
| `SUPABASE_DB_SSLMODE` | no | `require` (default, Supabase). Use `prefer`/`disable` for local/CI test DBs |
| `SUPABASE_S3_ENDPOINT` | yes | S3-compatible endpoint |
| `SUPABASE_S3_ACCESS_KEY` | yes | Storage access key |
| `SUPABASE_S3_SECRET_KEY` | yes | Storage secret key |
| `SUPABASE_S3_BUCKET` | no | Bucket name (default `document`) |
| `SUPABASE_S3_REGION` | no | Default `us-east-1` |
| `GROQ_API_KEY` | yes | Groq LLM provider |
| `COHERE_API_KEY` | no | Enables reranking if present (skipped otherwise) |
| `MAX_UPLOAD_SIZE_MB` | no | Per-file upload cap for documents (default `50`) |

## 2. Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> `sentence-transformers`, `torch`, and `unstructured` are heavy — the first
> install can take several minutes. These are imported lazily so the dev server
> still starts quickly.

## 3. Apply migrations

```bash
python manage.py migrate
```

## 4. Create a staff/admin user

```bash
python manage.py createsuperuser
```

## 5. Run the dev server

```bash
python manage.py runserver
```

The server is available at http://127.0.0.1:8000.

> **Document training runs automatically.** Every served web process starts an
> in-process ingestion worker, so uploads are parsed, chunked, embedded and
> stored in the vector DB without any extra step. Set
> `INGESTION_EMBEDDED_WORKER=0` to disable when a dedicated
> `python manage.py trainworker` process is running instead.

---

## URLs

| Path | Description | Access |
|---|---|---|
| `/` | Chat page | anyone |
| `/api/chat` | Non-streaming answer (POST JSON) | anyone |
| `/api/chat/stream` | SSE-streamed answer (POST JSON) | anyone |
| `/api/recommendations` | Personalized (or popularity) hotel picks | anyone |
| `/api/recommendations/similar/<id>` | Similar stays for a hotel | anyone |
| `/healthz` | Liveness probe (checks DB connectivity) | anyone |
| `/admin/` | Django admin | staff |
| `/accounts/login/` | Login | — |
| `/api/auth/signup` | Create a (local or Supabase) account | anyone |
| `/api/auth/login` | Exchange email/password for a session | anyone |
| `/api/auth/refresh` | Refresh a session | anyone |
| `/api/auth/logout` | End the current session | Bearer token |
| `/api/auth/me` | Current (synced) user | Bearer token |

### Recommendations

Hybrid content + collaborative ranking, derived per request from `hotels`,
`rooms`, `bookings` and `reviews`. There are no recommendation models and no
migrations. See `recommendations/plan.md` for the full design and rationale.

`GET /api/recommendations` — personalized picks for a signed-in user, Bayesian
quality + review volume for anonymous callers:

```
/api/recommendations?limit=8&exclude=3,7&check_in=2026-11-01&check_out=2026-11-05&guests=2
```

| Param | Default | Notes |
|---|---|---|
| `limit` | 8 | clamped to `MAX_LIMIT` (50); non-integer or `< 1` → 400 |
| `exclude` | — | comma-separated hotel ids to drop |
| `check_in` / `check_out` | — | ISO dates; both or neither → else 400 |
| `guests` | — | positive int; requires both dates → else 400 |

```json
{
  "strategy": "personalized",
  "cold_start": false,
  "results": [ /* HotelSummarySerializer */ ]
}
```

`strategy` is `personalized` only once a user has enough history for
collaborative signals to count; during cold start it reports `popular`, so a
client can label the section honestly instead of asserting a personalization it
did not receive.

`GET /api/recommendations/similar/<hotel_id>` — related stays by co-stay
evidence and content fit. 404s when the seed hotel is not visible to the
caller, and never includes the seed in its own results.

`GET /api/hotels?sort=recommended` — re-ranks the hotel list. Ranking happens
before pagination so `count` and page boundaries stay consistent. `sort=rating`
and `sort=price` are also accepted; unknown values fall back to newest first.

Notes:

- **Ratings are computed live** from `Review`, not read from
  `Hotel.avg_rating`. That denormalized field is not maintained by any signal
  in this codebase and is only consulted as a fallback for hotels with zero
  reviews.
- **Availability is honoured** when `check_in`/`check_out` are supplied. Note
  that booking *creation* still performs no overlap check — see
  `recommendations/plan.md`.
- Results are cached process-locally for `CACHE_TTL_SECONDS` (default 300) and
  keyed on the caller's identity, so owners and staff never have their own draft
  properties cached for anonymous callers.

### Chat API

`POST /api/chat` — full answer as JSON:

```json
{"message": "What is the return policy?", "conversation_id": 1}
```

```json
{
  "conversation_id": 1,
  "answer": "...",
  "citations": [{"source": "...", "title": "...", "page": 2, "text": "..."}]
}
```

`POST /api/chat/stream` — SSE events (`text/event-stream` via `fetch`):

```
data: {"type": "token", "text": "The"} 
data: {"type": "token", "text": " policy..."}
data: {"type": "done", "answer": "...", "citations": [...]}
```

All POSTs use JSON bodies that include the message and an optional
`conversation_id` to continue a thread. anonymous/authenticated identities are
throttled to 12 chats/minute (DB-backed, returns `429`); messages over
4,000 characters are rejected.

History-free questions (first turn of a thread, FAQ-style) are served from a
process-local answer cache (30-minute TTL) to cut LLM spend; follow-up turns
bypass it automatically.

## Training documents

Documents are managed through the admin app's **Documents** area (staff-only).
Upload one or more files (max one per document; supported types: `pdf`,
`docx`, `txt`, `md`, `csv`, `xlsx`, `xls`). The document is queued and trained
in the background by the dedicated `trainworker`; status lifecycle:
`pending → processing → ready` (or `failed`).

Failed documents expose the error message in the UI; the **Re-train** button
re-runs the pipeline. Downloads are only queryable once status is `ready`.

## Docker

The included `Dockerfile` runs the app with **gunicorn** and installs the
document-parsing system libraries. To run everything (backend + frontend +
training worker) from the repository root:

```bash
docker compose up --build
```

This mounts `./backend` into the container, applies migrations on start, and
runs the dev server on port 8000 plus a dedicated `trainworker` container (the
web service explicitly disables its in-process worker so the dedicated one is
the only trainer). The containers read `./backend/.env`. The backend service
has a `/healthz` health-check wired into `docker compose`.

For production the `Dockerfile` runs **gunicorn** (2 workers × 8 threads, 120s
timeout — overridable via `GUNICORN_WORKERS`/`GUNICORN_THREADS`/
`GUNICORN_TIMEOUT`/`GUNICORN_GRACEFUL_TIMEOUT`) with `collectstatic` on boot;
each gunicorn worker starts an in-process ingestion poller, so uploads train
automatically in a single-container deployment. Static files are served by
**WhiteNoise** (`CompressedManifest`), so no nginx is required for a
single-container deployment.

## Tests

The suite covers the chat API (validation, rate limiting, cache, streaming,
history pairing), document ingestion (cleaning, tables, loaders, chunking,
upload limits, worker claim/staleness), and recommendations (Bayesian rating,
content and collaborative scoring, cold start, visibility, availability,
determinism, and `sort=recommended`). DB-backed tests need Postgres with
pgvector; unit tests run against a plain local install.

```bash
# against a local pgvector Postgres (e.g. via docker):
docker run -d --name test-pg -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 pgvector/pgvector:pg16

SUPABASE_DB_HOST=127.0.0.1 SUPABASE_DB_PORT=5432 \
SUPABASE_DB_USER=postgres SUPABASE_DB_PASSWORD=postgres \
SUPABASE_DB_SSLMODE=prefer python manage.py test chat document_ingestion recommendations
```

CI (`.github/workflows/ci.yml`) runs the same checks against a pgvector service
container.

## Project layout

```
backend/
├── chat/                    # chat page, API views, RAG retrieval + answer pipeline
├── config/                  # Django project (settings, urls, wsgi/asgi)
├── document_ingestion/      # documents admin UI, models, parsing/chunking/embedding
│   └── ingestion/
│       ├── loaders.py       # pdf/docx via unstructured; txt/md/csv/excel → text
│       ├── chunking.py      # split elements into chunks
│       ├── embedding.py     # lazy sentence-transformers wrapper (all-MiniLM-L6-v2)
│       ├── pipeline.py      # run_training orchestration
│       └── automation.py    # in-process background worker + startup sweep
├── recommendations/         # hotel ranking (no models, no migrations)
│   ├── plan.md              # design doc: signals, weights, trade-offs
│   ├── signals.py           # batched per-hotel feature extraction
│   ├── profiles.py          # user taste vector from bookings + reviews
│   ├── scoring.py           # content / collaborative / popularity + blend
│   ├── availability.py      # capacity vs overlapping bookings
│   └── cache.py             # process-local TTL cache
├── templates/               # shared base.html, auth templates
├── manage.py
└── requirements.txt
```

## Troubleshooting

- **Dev server takes forever to start** — first boot loads torch/unstructured
  only when first needed; subsequent startups are fast. Never remove the lazy
  imports in `embedding.py` / `loaders.py` / `chat/services.py`.
- **Document stuck on `processing`** — the worker refreshes a heartbeat while
  training; if the worker is killed mid-run the document is reclaimed once its
  heartbeat goes stale (about 2 minutes). Just wait or restart the worker and
  the document resumes automatically.
- **DB migrated under the old `documents` app name** — tables were renamed to
  `document_ingestion_*` and the `document_ingestion` migrations recorded as
  applied. If you ever need to rebuild from scratch:
  drop the `document_ingestion_*` tables and rerun `python manage.py migrate`.