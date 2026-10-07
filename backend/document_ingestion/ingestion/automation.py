"""Document ingestion worker.

Web processes only mark documents `pending`; training is performed by a worker
process. The worker claims documents atomically using Postgres row locks
(`FOR UPDATE SKIP LOCKED`), which makes it safe to run from multiple processes
without a broker.

Deployment modes:
- In-process (default): the thread started from the app's ready() hook polls
  the DB, so every served web process ingests automatically. Set
  INGESTION_EMBEDDED_WORKER=0 to disable (e.g. when a dedicated worker runs).
- Dedicated process: run `python manage.py trainworker`. Both modes may
  coexist safely because claims are exclusive (`FOR UPDATE SKIP LOCKED`).

A document stuck in `processing` and not heartbeating for STALE_HEARTBEAT_SECONDS
is considered orphaned (worker crashed) and is reclaimed automatically.
"""

import logging
import os
import threading
import time
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

STALE_HEARTBEAT_SECONDS = 120
DEFAULT_POLL_SECONDS = 2.0
HEARTBEAT_INTERVAL_SECONDS = 15


def claim_next_document():
    """Atomically claim the next trainable document and return it (or None).

    Claimable rows: `pending`, or `processing` documents whose heartbeat is
    stale (orphaned by a crashed worker). The claim flips the row to
    `processing` with a fresh heartbeat inside a transaction so a second
    process/thread can never claim the same document concurrently.
    """
    from document_ingestion.models import ReferenceDocument

    stale_before = timezone.now() - timedelta(seconds=STALE_HEARTBEAT_SECONDS)
    with transaction.atomic():
        candidate = (
            ReferenceDocument.objects.select_for_update(skip_locked=True)
            .filter(
                Q(status="pending")
                | Q(status="processing", worker_heartbeat__isnull=True)
                | Q(status="processing", worker_heartbeat__lt=stale_before)
            )
            .order_by("created_at")
            .first()
        )
        if candidate is None:
            return None
        ReferenceDocument.objects.filter(pk=candidate.pk).update(
            status="processing",
            error="",
            worker_heartbeat=timezone.now(),
        )
    return candidate


def _refresh_heartbeat(document_id):
    from document_ingestion.models import ReferenceDocument

    ReferenceDocument.objects.filter(document_id=document_id).update(
        worker_heartbeat=timezone.now(),
    )


def _process_claimed(document):
    from .pipeline import run_training
    from django.db import connections

    document_id = str(document.document_id)
    stop = threading.Event()

    def beat():
        while not stop.is_set():
            stop.wait(HEARTBEAT_INTERVAL_SECONDS)
            try:
                _refresh_heartbeat(document_id)
            except Exception:
                # A missed beat is not fatal; the row just becomes reclaimable
                # after the stale threshold. Keep the thread alive.
                logger.warning("Heartbeat refresh failed for %s", document_id, exc_info=True)

    heartbeater = threading.Thread(target=beat, daemon=True, name="worker-heartbeat")
    heartbeater.start()
    try:
        run_training(document_id)
    except Exception:
        logger.exception("Training job crashed for %s", document_id)
    finally:
        stop.set()
        try:
            # This thread's DB connection is thread-local; close only ours so we
            # never clobber connections owned by other request/worker threads.
            connections.close_all()
        except Exception:
            pass


def worker_loop(poll_seconds=DEFAULT_POLL_SECONDS, once=False):
    """Claim and train documents forever (or drain the queue when once=True).

    With `once`, keep claiming until nothing is left, then return. This makes
    CLI one-shot runs (e.g. a container that trains then exits) drain a backlog
    instead of stopping after the first document.
    """
    while True:
        document = claim_next_document()
        if document is None:
            if once:
                return
            time.sleep(poll_seconds)
            continue
        _process_claimed(document)


_embedded_thread = None
_embedded_lock = threading.Lock()


def ensure_embedded_worker():
    """Start a polling worker thread in this process (default).

    On by default so uploads are ingested without a separate process; disable
    with INGESTION_EMBEDDED_WORKER=0 when a dedicated `python manage.py
    trainworker` is running instead. Combining both is safe (claims are
    exclusive).
    """
    global _embedded_thread
    if os.getenv("INGESTION_EMBEDDED_WORKER", "").strip().lower() in ("0", "false", "no"):
        return
    with _embedded_lock:
        if _embedded_thread is not None and _embedded_thread.is_alive():
            return
        _embedded_thread = threading.Thread(
            target=worker_loop,
            name="ingestion-embedded-worker",
            daemon=True,
        )
        _embedded_thread.start()