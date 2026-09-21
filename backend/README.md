# Sansaaric Stay — Backend

Django + pgvector RAG backend for the Sansaaric Stay assistant. Upload documents
(PDF / DOCX / TXT / Markdown / CSV / Excel), train them into embeddings, and get
grounded, cited answers via a Groq LLM with Cohere reranking.

## Architecture at a glance

```
upload /docadmin  ──►  document_ingestion  ──► chunks + embeddings (pgvector)
                        │
chat (web + API)   ──►  retrieve: hybrid (pgvector + full-text) search
                        ├─ reformulate question (LLM, if history)
                        ├─ embed query (all-MiniLM-L6-v2)
                        ├─ hybrid search ──► RRF fusion ──► Cohere rerank
                        └─ answer: Groq LLM with numbered sources + citations
```

- **Database:** Supabase PostgreSQL with the `pgvector` extension.
- **Storage:** Supabase S3-compatible bucket (`document`), wired through `django-storages`.
- **Worker:** training runs in a **dedicated `python manage.py trainworker`**
  process that polls the database (`FOR UPDATE SKIP LOCKED`) and claims
  documents with a crash-safe heartbeat — no Celery/qcluster/broker required.
  Web processes only mark documents `pending`; a crashed worker's orphaned
  `processing` documents are reclaimed once their heartbeat goes stale.
  For single-process dev you can set `INGESTION_EMBEDDED_WORKER=1` to run the
  worker as a thread inside the web process.
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
| `MAX_UPLOAD_SIZE_MB` | no | Per-file upload cap at `/docadmin/` (default `50`) |

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

> **Document training needs a worker.** Either run the worker in a second
> terminal (`python manage.py trainworker`) or set `INGESTION_EMBEDDED_WORKER=1`
> in `.env` to run it inside the web process (single-process dev convenience).

---

## URLs

| Path | Description | Access |
|---|---|---|
| `/` | Chat page | anyone |
| `/api/chat` | Non-streaming answer (POST JSON) | anyone |
| `/api/chat/stream` | SSE-streamed answer (POST JSON) | anyone |
| `/healthz` | Liveness probe (checks DB connectivity) | anyone |
| `/docadmin/` | Upload / train / delete documents | staff (login required) |
| `/docadmin/status/` | Document + chunk status JSON | staff |
| `/docadmin/chats/` | Review user conversations | staff |
| `/admin/` | Django admin | staff |
| `/accounts/login/` | Login | — |
| `/api/auth/signup` | Create a Supabase account | anyone |
| `/api/auth/login` | Exchange email/password for a session | anyone |
| `/api/auth/refresh` | Rotate a refresh token | anyone |
| `/api/auth/logout` | Revoke the current Supabase session | Bearer token |
| `/api/auth/me` | Current (synced) user | Bearer token |

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

1. Log in to `/docadmin/`.
2. Upload one or more files (max one per document; supported types:
   `pdf`, `docx`, `txt`, `md`, `csv`, `xlsx`, `xls`).
3. The document is queued and trained in the background. Rows stream in via
   `/docadmin/status/`. Status lifecycle: `pending → processing → ready` (or `failed`).

Failed documents expose the error message on the dashboard; the **Re-train**
button re-runs the pipeline. Downloads are only queryable once status is `ready`.

## Docker

The included `Dockerfile` runs the app with **gunicorn** and installs the
document-parsing system libraries. To run everything (backend + frontend +
training worker) from the repository root:

```bash
docker compose up --build
```

This mounts `./backend` into the container, applies migrations on start, and
runs the dev server on port 8000 plus a dedicated `trainworker` container. The
containers read `./backend/.env`. The backend service has a `/healthz`
health-check wired into `docker compose`.

For production the `Dockerfile` runs **gunicorn** (2 workers × 8 threads, 120s
timeout — overridable via `GUNICORN_WORKERS`/`GUNICORN_THREADS`/
`GUNICORN_TIMEOUT`/`GUNICORN_GRACEFUL_TIMEOUT`) with `collectstatic` on boot;
static files are served by **WhiteNoise** (`CompressedManifest`), so no nginx
is required for a single-container deployment.

## Tests

The suite covers the chat API (validation, rate limiting, cache, streaming,
history pairing) and document ingestion (cleaning, tables, loaders, chunking,
upload limits, worker claim/staleness). DB-backed tests need Postgres with
pgvector; unit tests run against a plain local install.

```bash
# against a local pgvector Postgres (e.g. via docker):
docker run -d --name test-pg -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 pgvector/pgvector:pg16

SUPABASE_DB_HOST=127.0.0.1 SUPABASE_DB_PORT=5432 \
SUPABASE_DB_USER=postgres SUPABASE_DB_PASSWORD=postgres \
SUPABASE_DB_SSLMODE=prefer python manage.py test chat document_ingestion
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