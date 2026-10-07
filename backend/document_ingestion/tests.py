"""Tests for document ingestion: cleaning, tables, loaders, chunking,
upload validation, and the worker's claim logic.

DB-based tests need Postgres with pgvector (the test DB is created from
migrations, which apply the extension). Run against a local/CI pgvector
Postgres:

    DATABASE_URL=postgresql://user:pass@localhost:5432/... \
        .venv/bin/python manage.py test document_ingestion
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from document_ingestion.ingestion import cleaning
from document_ingestion.ingestion.automation import (
    STALE_HEARTBEAT_SECONDS,
    claim_next_document,
    worker_loop,
)
from document_ingestion.ingestion.chunking import chunk_elements
from document_ingestion.ingestion.loaders import TextDocument, load_source
from document_ingestion.ingestion.pipeline import run_training
from document_ingestion.ingestion.tables import clean_cell, html_table_to_text
from document_ingestion.models import Chunk, ReferenceDocument

from .serializers import DocumentSerializer


class CleaningTests(SimpleTestCase):
    def test_content_hash_is_stable(self):
        self.assertEqual(
            cleaning.content_hash("hello"),
            cleaning.content_hash("hello"),
        )
        self.assertNotEqual(
            cleaning.content_hash("hello"),
            cleaning.content_hash("world"),
        )

    def test_dedupes_and_drops_all_whitespace(self):
        chunks = [
            {"content": "same"},
            {"content": "same"},
            {"content": "   "},
            {"content": "other"},
        ]
        out = cleaning.dedupe(cleaning.drop_empty(chunks))
        self.assertEqual([c["content"] for c in out], ["same", "other"])


class TableTests(SimpleTestCase):
    def test_html_table_to_text(self):
        table = (
            "<table><tr><th>City</th><th>Rate</th></tr>"
            "<tr><td>Lisbon</td><td>120</td></tr></table>"
        )
        text = html_table_to_text(table)
        self.assertEqual(text.splitlines()[0], "City | Rate")
        self.assertEqual(text.splitlines()[1], "---")
        self.assertEqual(text.splitlines()[2], "Lisbon | 120")

    def test_clean_cell(self):
        self.assertEqual(clean_cell(" a\u00a0b "), "a b")
        self.assertEqual(clean_cell(None), "")


class LoaderTests(SimpleTestCase):
    def test_txt_returns_text_document(self):
        doc = load_source(b"Hello\nWorld", "notes.txt", "txt")
        self.assertIsInstance(doc, TextDocument)
        self.assertEqual(doc.text, "Hello\nWorld")

    def test_csv_converts_to_pipe_text(self):
        doc = load_source(b"city,rate\nLisbon,120\n", "rates.csv", "csv")
        text = doc.text
        self.assertIn("city | rate", text)
        self.assertIn("Lisbon | 120", text)

    def test_xlsx_converts_each_sheet_to_pipe_text(self):
        import io

        import pandas as pd

        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            pd.DataFrame({"city": ["Lisbon"], "rate": [120]}).to_excel(
                writer, sheet_name="rates", index=False
            )
            pd.DataFrame({"name": ["House"]}).to_excel(
                writer, sheet_name="inventory", index=False
            )
        doc = load_source(buf.getvalue(), "inventory.xlsx", "xlsx")
        text = doc.text
        self.assertIn("city | rate", text)
        self.assertIn("Lisbon | 120", text)
        self.assertIn("name", text)
        self.assertIn("House", text)

    def test_unsupported_type_raises(self):
        with self.assertRaises(ValueError):
            load_source(b"x", "page.html", "html")

    def test_dotted_extension_is_normalized(self):
        doc = load_source(b"text", "notes.txt", ".txt")
        self.assertEqual(doc.text, "text")


class ChunkingTests(SimpleTestCase):
    def test_text_document_chunks_are_nonempty_and_pagefree(self):
        sample = "The quick brown fox jumps over the lazy dog. " * 120
        chunks = chunk_elements(TextDocument(sample))
        self.assertGreater(len(chunks), 1)
        for chunk in chunks:
            self.assertTrue(chunk["content"].strip())
            self.assertIsNone(chunk["page"])
            self.assertEqual(chunk["tables_html"], [])


class ClaimWorkerTests(TestCase):
    def test_claim_pending_document(self):
        document = ReferenceDocument.objects.create(
            file_name="rates.txt",
            file_type="txt",
            status="pending",
        )
        claimed = claim_next_document()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed.pk, document.pk)
        document.refresh_from_db()
        self.assertEqual(document.status, "processing")
        self.assertIsNotNone(document.worker_heartbeat)

    def test_no_documents_returns_none(self):
        self.assertIsNone(claim_next_document())

    def test_fresh_processing_document_is_not_reclaimed(self):
        ReferenceDocument.objects.create(
            file_name="a.txt",
            file_type="txt",
            status="processing",
            worker_heartbeat=timezone.now(),
        )
        self.assertIsNone(claim_next_document())

    def test_stale_processing_document_is_reclaimed(self):
        stale = ReferenceDocument.objects.create(
            file_name="b.txt",
            file_type="txt",
            status="processing",
            worker_heartbeat=timezone.now()
            - timedelta(seconds=STALE_HEARTBEAT_SECONDS + 30),
        )
        claimed = claim_next_document()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed.pk, stale.pk)

    def test_ready_document_is_never_claimed(self):
        ReferenceDocument.objects.create(
            file_name="c.txt",
            file_type="txt",
            status="ready",
            worker_heartbeat=None,
        )
        self.assertIsNone(claim_next_document())

    def test_oldest_pending_claim_first(self):
        older = ReferenceDocument.objects.create(
            file_name="o.txt",
            file_type="txt",
            status="pending",
        )
        ReferenceDocument.objects.create(
            file_name="n.txt",
            file_type="txt",
            status="pending",
        )
        claimed = claim_next_document()
        self.assertEqual(claimed.pk, older.pk)


class RunTrainingTests(TestCase):
    """End-to-end pipeline: parse -> chunk -> embed -> store.

    Source bytes and embeddings are stubbed so no S3 upload or model download
    happens; the test still exercises chunking, dedupe, atomic replace and the
    status/error lifecycle.
    """

    STUB_VECTOR = [0.1] * 384

    def _document(self, content, name="house-rules.txt"):
        return ReferenceDocument.objects.create(
            file_name=name,
            file_type=name.rsplit(".", 1)[-1],
            file_size=len(content),
            status="pending",
        )

    def _train(self, document, content):
        with patch(
            "document_ingestion.ingestion.pipeline._read_source",
            return_value=content.encode(),
        ), patch(
            "document_ingestion.ingestion.pipeline.embed_texts",
            side_effect=lambda contents: [self.STUB_VECTOR for _ in contents],
        ) as embed:
            run_training(str(document.document_id))
        return embed

    def test_trains_document_and_marks_ready(self):
        document = self._document("Late check-out is 11 AM. ")
        embed = self._train(document, "Late check-out is 11 AM. ")
        self.assertEqual(embed.call_count, 1)

        document.refresh_from_db()
        self.assertEqual(document.status, "ready")
        chunks = list(Chunk.objects.filter(document=document).order_by("chunk_index"))
        self.assertTrue(chunks)
        self.assertEqual(chunks[0].metadata["title"], "house-rules")
        self.assertEqual(chunks[0].metadata["source"], "house-rules.txt")
        self.assertTrue(all(c.search_vector is not None for c in chunks))

    def test_retrain_replaces_chunks_atomically(self):
        document = self._document("Old content only. ")
        self._train(document, "Old content only. ")
        original_ids = set(
            Chunk.objects.filter(document=document).values_list("pk", flat=True)
        )

        self._train(document, "Brand new content only. ")

        document.refresh_from_db()
        self.assertEqual(document.status, "ready")
        new_ids = set(
            Chunk.objects.filter(document=document).values_list("pk", flat=True)
        )
        self.assertTrue(new_ids)
        self.assertTrue(original_ids.isdisjoint(new_ids))

    def test_no_extractable_text_marks_failed(self):
        document = self._document("pending")
        self._train(document, "\n\t  \n  ")
        document.refresh_from_db()
        self.assertEqual(document.status, "failed")
        self.assertEqual(document.error, "no extractable text")
        self.assertFalse(Chunk.objects.filter(document=document).exists())


class WorkerLoopTests(TestCase):
    """The queue worker drains pending and orphaned-processing documents."""

    def test_drains_pending_and_stale_processing(self):
        pending = ReferenceDocument.objects.create(
            file_name="p.txt", file_type="txt", status="pending"
        )
        ReferenceDocument.objects.create(
            file_name="live.txt",
            file_type="txt",
            status="processing",
            worker_heartbeat=timezone.now(),
        )
        ReferenceDocument.objects.create(
            file_name="done.txt", file_type="txt", status="ready"
        )
        stale = ReferenceDocument.objects.create(
            file_name="stale.txt",
            file_type="txt",
            status="processing",
            worker_heartbeat=timezone.now()
            - timedelta(seconds=STALE_HEARTBEAT_SECONDS + 30),
        )

        processed = []
        with patch(
            "document_ingestion.ingestion.automation._process_claimed",
            side_effect=lambda doc: processed.append(str(doc.document_id)),
        ):
            worker_loop(poll_seconds=0, once=True)

        self.assertEqual(
            set(processed),
            {str(pending.document_id), str(stale.document_id)},
        )


# --- Moved from admin_api/tests.py (D10). Auth assertions are repaired in Phase T (C1). ---


class DocumentSerializerShape(SimpleTestCase):
    """Pinned to the exact keys types/index.ts declares."""

    def test_document_exposes_id_not_document_id(self):
        data = DocumentSerializer(
            ReferenceDocument(
                document_id="11111111-2222-3333-4444-555555555555",
                file_name="rules.pdf",
                file_type="pdf",
                file_size=1024,
                status="ready",
            )
        ).data
        self.assertEqual(data["id"], "11111111-2222-3333-4444-555555555555")
        self.assertNotIn("document_id", data)
        self.assertEqual(data["status"], "ready")
        self.assertNotIn("title", data)


class AdminDocumentViews(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            username="staff@example.com", email="staff@example.com", password="x" * 10,
            is_staff=True,
        )
        self.guest = get_user_model().objects.create_user(
            username="guest@example.com", email="guest@example.com", password="x" * 10,
            is_staff=False,
        )

    def test_documents_require_staff(self):
        self.assertEqual(self.client.get("/api/admin/documents").status_code, 401)
        self.client.force_login(self.guest)
        self.assertEqual(self.client.get("/api/admin/documents").status_code, 403)

    def test_document_round_trip(self):
        self.client.force_login(self.staff)
        upload = SimpleUploadedFile(
            "house-rules.pdf", b"%PDF-1.4 fake", content_type="application/pdf"
        )
        response = self.client.post(
            "/api/admin/documents", {"files": [upload]}
        )
        self.assertEqual(response.status_code, 201, response.content)
        document_id = response.json()[0]["id"]

        listed = self.client.get("/api/admin/documents").json()
        self.assertEqual([d["id"] for d in listed], [document_id])
        self.assertEqual(listed[0]["file_name"], "house-rules.pdf")
        self.assertNotIn("title", listed[0])
        self.assertEqual(listed[0]["chunk_count"], 0)

        detail = self.client.get(f"/api/admin/documents/{document_id}/content")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["chunks"], [])

        self.client.post(f"/api/admin/documents/{document_id}/train")
        self.client.delete(f"/api/admin/documents/{document_id}")
        self.assertFalse(ReferenceDocument.objects.filter(document_id=document_id).exists())

    def test_upload_rejects_unsupported_type(self):
        self.client.force_login(self.staff)
        response = self.client.post(
            "/api/admin/documents",
            {"files": [SimpleUploadedFile("notes.exe", b"MZ")]},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("unsupported type", response.json()["files"][0])