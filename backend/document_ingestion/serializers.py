"""Serializers for the staff documents admin API.

Deliberately thin read models over `document_ingestion.ReferenceDocument` so the
Next.js admin has one documented JSON shape to code against.
"""

import os

import magic as libmagic
from rest_framework import serializers

from .ingestion.loaders import SUPPORTED_TYPES
from .models import ReferenceDocument

# Per-file upload cap so an oversized file gets a 400 instead of being
# written to storage.
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50")) * 1024 * 1024

# Magic-bytes smell test per supported extension (S3): the declared extension
# must agree with what libmagic detects. Text-family types share text/plain;
# binary types get their own OOXML/OLE/PDF signatures.
_SNIFF_HEAD_BYTES = 4096
_SIGNATURE_MIME = {
    "pdf": {"application/pdf"},
    "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    "xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    "xls": {
        "application/vnd.ms-excel",
        "application/x-ole-storage",
        "application/vnd.ms-office",
    },
    "csv": {"text/csv", "text/plain"},
    "txt": {"text/plain"},
    "md": {"text/plain"},
}


class DocumentSerializer(serializers.ModelSerializer):
    """List/row shape for the documents table."""

    id = serializers.CharField(source="document_id", read_only=True)
    file_type = serializers.CharField()
    file_size = serializers.IntegerField(read_only=True)
    chunk_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ReferenceDocument
        fields = [
            "id", "file_name", "file_type", "file_size",
            "status", "error", "chunk_count", "created_at", "updated_at",
        ]
        read_only_fields = fields


class DocumentUploadSerializer(serializers.Serializer):
    """Multipart upload: repeated `files`. The visible name is the file name."""

    files = serializers.ListField(
        child=serializers.FileField(), allow_empty=False, max_length=25
    )

    def validate_files(self, uploaded):
        for item in uploaded:
            name = os.path.basename(item.name)
            ftype = os.path.splitext(name)[1].lower().lstrip(".")
            if item.size > MAX_UPLOAD_SIZE:
                self._fail(f"{name}: exceeds the {MAX_UPLOAD_SIZE // (1024 * 1024)} MB maximum upload size.")
            if not ftype:
                self._fail(f"{name}: file has no extension.")
            if ftype not in SUPPORTED_TYPES:
                self._fail(
                    f"{name}: unsupported type .{ftype} "
                    f"(supported: {', '.join(sorted(SUPPORTED_TYPES))})."
                )
            head = item.file.read(_SNIFF_HEAD_BYTES)
            item.file.seek(0)
            detected = libmagic.from_buffer(head, mime=True)
            if detected not in _SIGNATURE_MIME[ftype]:
                self._fail(
                    f"{name}: content does not match its .{ftype} extension "
                    f"(detected {detected})."
                )
        return uploaded

    def _fail(self, message):
        raise serializers.ValidationError(message)


class DocumentDetailSerializer(serializers.ModelSerializer):
    """Document metadata plus trained chunk text, for the viewer and modal."""

    id = serializers.CharField(source="document_id", read_only=True)
    chunk_count = serializers.IntegerField(read_only=True)
    chunks = serializers.SerializerMethodField()

    class Meta:
        model = ReferenceDocument
        fields = [
            "id", "file_name", "file_type", "file_size",
            "status", "error", "chunk_count", "created_at", "updated_at", "chunks",
        ]
        read_only_fields = fields

    def get_chunks(self, document):
        return [
            {"index": chunk.chunk_index, "content": chunk.content}
            for chunk in document.chunks.order_by("chunk_index")
        ]
