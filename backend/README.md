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
- **Worker:** training runs **in-process** via a daemon thread — no Celery/qcluster/broker required.
  On startup it sweeps `pending` (and orphaned `processing`) documents and retrains them automatically.
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
| `SUPABASE_S3_ENDPOINT` | yes | S3-compatible endpoint |
| `SUPABASE_S3_ACCESS_KEY` | yes | Storage access key |
| `SUPABASE_S3_SECRET_KEY` | yes | Storage secret key |
| `SUPABASE_S3_BUCKET` | no | Bucket name (default `document`) |
| `SUPABASE_S3_REGION` | no | Default `us-east-1` |
| `GROQ_API_KEY` | yes | Groq LLM provider |
| `COHERE_API_KEY` | no | Enables reranking if present (skipped otherwise) |

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

---

## URLs

| Path | Description | Access |
|---|---|---|
| `/` | Chat page | anyone |
| `/api/chat` | Non-streaming answer (POST JSON) | anyone |
| `/api/chat/stream` | SSE-streamed answer (POST JSON) | anyone |
| `/docadmin/` | Upload / train / delete documents | staff (login required) |
| `/docadmin/status/` | Document + chunk status JSON | staff |
| `/docadmin/chats/` | Review user conversations | staff |
| `/admin/` | Django admin | staff |
| `/accounts/login/` | Login | — |

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
`conversation_id` to continue a thread.

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
document-parsing system libraries. To run everything (backend + frontend) from
the repository root:

```bash
docker compose up --build
```

This mounts `./backend` into the container, applies migrations on start, and
runs the dev server on port 8000. The container reads `./backend/.env`.

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
- **Document stuck on `processing`** — a run interrupted by a server restart
  leaves a `processing` orphan. The startup sweep now re-trains these
  automatically; a server restart is enough to recover them.
- **DB migrated under the old `documents` app name** — tables were renamed to
  `document_ingestion_*` and the `document_ingestion` migrations recorded as
  applied. If you ever need to rebuild from scratch:
  drop the `document_ingestion_*` tables and rerun `python manage.py migrate`.