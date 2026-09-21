import os

from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    name = 'document_ingestion'

    def ready(self):
        # Web deployments run a dedicated `python manage.py trainworker`
        # process. For single-process dev you may set
        # INGESTION_EMBEDDED_WORKER=1 to run the worker inside the web process.
        from .ingestion import automation
        automation.ensure_embedded_worker()

        # PREWARM_PIPELINE=1 loads the embedding model and probes the Groq
        # model pool on a background thread at startup, so the first user
        # request doesn't pay lazy-load latency. Boot is never blocked on it.
        if os.getenv("PREWARM_PIPELINE"):
            from chat import services
            services.prewarm_pipeline_async()
