from django.contrib import admin

from .models import Chunk, ReferenceDocument


@admin.register(ReferenceDocument)
class ReferenceDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "file_type", "file_size", "status", "created_at")
    list_filter = ("status", "file_type")
    search_fields = ("title", "file_name")
    readonly_fields = ("document_id", "file", "file_name", "file_size", "created_at", "updated_at")


@admin.register(Chunk)
class ChunkAdmin(admin.ModelAdmin):
    list_display = ("document", "chunk_index", "preview")
    list_filter = ("document",)
    ordering = ("document", "chunk_index")

    def preview(self, obj):
        return obj.content[:80].replace("\n", " ")

    preview.short_description = "Content preview"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False