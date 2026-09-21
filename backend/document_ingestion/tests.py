"""Tests for document ingestion: cleaning, tables, loaders, chunking,
upload validation, and the worker's claim logic.

DB-based tests need Postgres with pgvector (the test DB is created from
migrations, which apply the extension). Run against a local/CI pgvector
Postgres:

    DATABASE_URL=postgresql://user:pass@localhost:5432/... \
        .venv/bin/python manage.py test document_ingestion
"""

from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from unittest.mock import patch

from document_ingestion.ingestion import cleaning
from document_ingestion.ingestion.automation import (
    STALE_HEARTBEAT_SECONDS,
    claim_next_document,
)
from document_ingestion.ingestion.chunking import chunk_elements
from document_ingestion.ingestion.loaders import TextDocument, load_source
from document_ingestion.ingestion.tables import clean_cell, html_table_to_text
from document_ingestion.models import ReferenceDocument
from document_ingestion.views import UploadForm


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


class UploadFormTests(SimpleTestCase):
    def _form(self, name, content=b"x", content_type="text/plain"):
        uploaded = SimpleUploadedFile(name, content, content_type=content_type)
        return UploadForm(data={}, files={"files": [uploaded]})

    def test_accepts_supported_type(self):
        form = self._form("guide.md")
        self.assertTrue(form.is_valid(), form.errors)

    def test_rejects_unsupported_type(self):
        form = self._form("evil.html")
        self.assertFalse(form.is_valid())
        self.assertIn("unsupported type", str(form.errors))

    def test_rejects_missing_extension(self):
        form = self._form("book")
        self.assertFalse(form.is_valid())
        self.assertIn("no extension", str(form.errors))

    def test_rejects_oversized_file(self):
        big = SimpleUploadedFile("big.pdf", b"x" * 64, content_type="application/pdf")
        with patch("document_ingestion.views.MAX_UPLOAD_SIZE", 32):
            form = UploadForm(data={}, files={"files": [big]})
            self.assertFalse(form.is_valid())
            self.assertIn("maximum upload size", str(form.errors))


class ClaimWorkerTests(TestCase):
    def test_claim_pending_document(self):
        document = ReferenceDocument.objects.create(
            title="Rates",
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
            title="In flight",
            file_name="a.txt",
            file_type="txt",
            status="processing",
            worker_heartbeat=timezone.now(),
        )
        self.assertIsNone(claim_next_document())

    def test_stale_processing_document_is_reclaimed(self):
        stale = ReferenceDocument.objects.create(
            title="Orphaned",
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
            title="Done",
            file_name="c.txt",
            file_type="txt",
            status="ready",
            worker_heartbeat=None,
        )
        self.assertIsNone(claim_next_document())

    def test_oldest_pending_claim_first(self):
        older = ReferenceDocument.objects.create(
            title="Older",
            file_name="o.txt",
            file_type="txt",
            status="pending",
        )
        ReferenceDocument.objects.create(
            title="Newer",
            file_name="n.txt",
            file_type="txt",
            status="pending",
        )
        claimed = claim_next_document()
        self.assertEqual(claimed.pk, older.pk)