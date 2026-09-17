"""In-process background ingestion worker.

Training jobs run inside the web process, so no separate qcluster worker or
external broker is required: uploading (or re-training) a document enqueues it
here and a single daemon thread runs the pipeline in the background.

On startup the worker also sweeps the database for documents still marked
"pending" and processes them, so uploads queued before a server restart (or
reload) are ingested automatically.
"""

import logging
import queue
import threading

from django.db import connections

logger = logging.getLogger(__name__)


class _Worker:
    def __init__(self):
        self._jobs = queue.Queue()
        self._thread = None
        self._lock = threading.Lock()

    def start(self):
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._thread = threading.Thread(
                target=self._run,
                name="ingestion-worker",
                daemon=True,
            )
            self._thread.start()

    def _run(self):
        self._sweep_pending()
        while True:
            document_id = self._jobs.get()
            try:
                self._process(document_id)
            finally:
                self._jobs.task_done()

    def enqueue(self, document_id):
        self.start()
        self._jobs.put(str(document_id))

    def _sweep_pending(self):
        try:
            from document_ingestion.models import ReferenceDocument

            pending = ReferenceDocument.objects.filter(status="pending")
            for document in pending:
                self._process(str(document.document_id))
        except Exception:
            logger.exception("Pending-document sweep failed")

    def _process(self, document_id):
        from .pipeline import run_training

        try:
            run_training(document_id)
        except Exception:
            logger.exception("Training job crashed for %s", document_id)
        finally:
            try:
                connections.close_all()
            except Exception:
                pass


_worker = _Worker()


def enqueue_run(document_id):
    """Queue a document for background training. Safe to call from any view."""
    _worker.enqueue(document_id)