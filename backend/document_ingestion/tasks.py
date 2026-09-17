"""django-q2 task wrappers for the ingestion pipeline."""


def train_document(document_id, source_path=None):
    """Train a single document (runs in the qcluster worker).

    `document_id` may be a UUID string or object. `source_path` is optional and
    intended for the local seed command (bypasses object storage).
    """
    from .ingestion.pipeline import run_training

    return run_training(document_id, source_path=source_path)