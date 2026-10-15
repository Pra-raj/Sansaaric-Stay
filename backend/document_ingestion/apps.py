import os
import sys

from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    name = 'document_ingestion'

    def ready(self):
        # Skip the background worker (and the expensive pipeline prewarm) for
        # management commands like test/migrate/collectstatic where probing a
        # live DB/GPU/LLM at boot is noise or actively disruptive.
        if any(arg in sys.argv for arg in ("test", "migrate", "collectstatic")):
            return
        # Any served web process ingests documents automatically via an
        # in-process polling worker (disable with INGESTION_EMBEDDED_WORKER=0
        # when a dedicated `python manage.py trainworker` process is running).
        from .ingestion import automation
        automation.ensure_embedded_worker()

        # PREWARM_PIPELINE=1 loads the embedding model and probes the Groq
        # model pool on a background thread at startup, so the first user
        # request doesn't pay lazy-load latency. Boot is never blocked on it.
        if os.getenv("PREWARM_PIPELINE"):
            from chat import services
            services.prewarm_pipeline_async()
