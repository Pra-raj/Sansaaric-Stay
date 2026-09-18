from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    name = 'document_ingestion'

    def ready(self):
        from .ingestion import automation
        automation.ensure_worker_started()
