"""Orchestrates the ingestion pipeline for a single ReferenceDocument.

Status lifecycle: pending / processing -> ready | failed.
"""

import logging

from django.contrib.postgres.search import SearchVector
from django.db import transaction
from django.utils import timezone

from .cleaning import dedupe, drop_empty
from .chunking import chunk_elements
from .embedding import embed_texts
from .loaders import SUPPORTED_TYPES, load_source

logger = logging.getLogger(__name__)


def run_training(document_id, source_path=None):
    """Train (or re-train) one document and persist its chunks atomically."""
    from document_ingestion.models import Chunk, ReferenceDocument

    try:
        document = ReferenceDocument.objects.get(document_id=document_id)
    except ReferenceDocument.DoesNotExist:
        return {"ok": False, "error": "Document not found", "chunks": 0, "pages": 0, "tables": 0}

    _set_status(document, "processing", "")

    try:
        raw_chunks = _build_raw_chunks(document, source_path)
        chunks = dedupe(drop_empty(raw_chunks))

        contents = [c["content"] for c in chunks]
        vectors = embed_texts(contents)

        rows = [
            Chunk(
                document=document,
                content=chunk["content"],
                embedding=vector,
                chunk_index=index,
                metadata=_chunk_metadata(document, chunk, index),
            )
            for index, (chunk, vector) in enumerate(zip(chunks, vectors), start=1)
        ]

        with transaction.atomic():
            document.chunks.all().delete()
            if rows:
                Chunk.objects.bulk_create(rows)
                Chunk.objects.filter(document=document).update(search_vector=SearchVector("content"))

        pages = sorted({c["page"] for c in chunks if c["page"]})
        tables = {html for c in chunks for html in c["tables_html"]}
        _set_status(document, "ready", "")
        return {"ok": True, "chunks": len(rows), "pages": pages, "tables": len(tables)}
    except Exception as exc:
        logger.exception("Training failed for %s", document.file_name)
        _set_status(document, "failed", str(exc))
        return {"ok": False, "error": str(exc), "chunks": 0, "pages": 0, "tables": 0}


def _build_raw_chunks(document, source_path):
    file_content = _read_source(document, source_path)
    ftype = document.file_type.lower().lstrip(".")
    if ftype not in SUPPORTED_TYPES:
        raise ValueError(f"Unsupported file type: {ftype!r}")
    elements = load_source(file_content, document.file_name, ftype)
    return chunk_elements(elements)


def _read_source(document, source_path):
    if source_path:
        with open(source_path, "rb") as fh:
            return fh.read()
    if document.file:
        document.file.open("rb")
        try:
            return document.file.read()
        finally:
            document.file.close()
    raise FileNotFoundError(f"No source file available for {document.file_name}")


def _chunk_metadata(document, chunk, index):
    return {
        "document_id": str(document.document_id),
        "title": document.title,
        "source": document.file_name,
        "page": chunk["page"],
        "chunk_index": index,
        "tables_html": chunk["tables_html"],
    }


def _set_status(document, status, error):
    type(document).objects.filter(pk=document.pk).update(
        status=status,
        error=error,
        updated_at=timezone.now(),
    )