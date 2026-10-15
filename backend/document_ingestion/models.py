import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from pgvector.django import HnswIndex, VectorField


class ReferenceDocument(models.Model):
    FILE_TYPES = [
        ("pdf", "PDF"),
        ("docx", "DOCX"),
        ("csv", "CSV"),
        ("xlsx", "Excel"),
        ("xls", "Excel (legacy)"),
        ("txt", "Text"),
        ("md", "Markdown"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("ready", "Ready"),
        ("failed", "Failed"),
    ]

    document_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    file = models.FileField(upload_to="documents/", blank=True)
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20, choices=FILE_TYPES)
    file_size = models.BigIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    error = models.TextField(blank=True, default="")
    worker_heartbeat = models.DateTimeField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.file_name


class Chunk(models.Model):
    document = models.ForeignKey(
        ReferenceDocument,
        related_name="chunks",
        on_delete=models.CASCADE,
        db_index=True,
    )
    content = models.TextField()
    embedding = VectorField(dimensions=384)
    search_vector = SearchVectorField(null=True)
    chunk_index = models.IntegerField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["chunk_index"]
        indexes = [
            HnswIndex(
                name="chunk_embedding_hnsw_idx",
                fields=["embedding"],
                opclasses=["vector_cosine_ops"],
                m=16,
                ef_construction=200,
            ),
            GinIndex(
                name="chunk_search_vector_gin_idx",
                fields=["search_vector"],
            ),
        ]

    def __str__(self):
        return f"{self.document.file_name} #{self.chunk_index}"