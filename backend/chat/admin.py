from django.contrib import admin
from django.db.models import Count, OuterRef, Subquery

from .models import Conversation, Message

PREVIEW_LENGTH = 80
CITATION_PREVIEW_LENGTH = 3
NO_VALUE = "—"


def _contact(conversation):
    """Name + email for a conversation, mirroring the inbox's fallback order.

    Kept local rather than importing from .views, which would drag the LLM
    stack (langchain, supabase) into every admin import.
    """
    if conversation.user:
        name = conversation.user.get_full_name() or conversation.user.username
    elif conversation.title and conversation.title != "New chat":
        name = conversation.title
    else:
        name = "Anonymous"
    email = conversation.email or (conversation.user.email if conversation.user else "")
    return f"{name} <{email}>" if email else name


class MessageInline(admin.TabularInline):
    """Read-only transcript. Messages are created by the inbox endpoints."""

    model = Message
    extra = 0
    can_delete = False
    show_change_link = False
    ordering = ("created_at",)
    fields = ("created_at", "role", "content", "citation_summary")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def citation_summary(self, obj):
        sources = []
        for citation in obj.citations or []:
            if not isinstance(citation, dict):
                continue
            label = str(citation.get("source") or "source")
            page = citation.get("page")
            sources.append(f"{label} p{page}" if page else label)
        if not sources:
            return NO_VALUE
        summary = ", ".join(sources[:CITATION_PREVIEW_LENGTH])
        overflow = len(sources) - CITATION_PREVIEW_LENGTH
        if overflow > 0:
            summary += f" (+{overflow} more)"
        return summary

    citation_summary.short_description = "Sources"


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "channel",
        "contact",
        "total_messages",
        "last_message",
        "updated_at",
    )
    list_filter = ("channel", "created_at")
    search_fields = ("title", "email", "phone", "note", "user__username", "user__email")
    inlines = (MessageInline,)
    fieldsets = (
        (None, {"fields": ("title", "channel", "user")}),
        ("Contact", {"fields": ("email", "phone", "note")}),
        (
            "Transcript",
            {
                "fields": (
                    "total_messages",
                    "session_key",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )
    readonly_fields = (
        "total_messages",
        "session_key",
        "created_at",
        "updated_at",
    )

    def get_queryset(self, request):
        last_message = (
            Message.objects.filter(conversation_id=OuterRef("pk"))
            .order_by("-created_at")
            .values("content")[:1]
        )
        return (
            super()
            .get_queryset(request)
            .select_related("user")
            .annotate(
                message_count=Count("messages"),
                last_message=Subquery(last_message),
            )
        )

    def contact(self, obj):
        return _contact(obj)

    contact.short_description = "Contact"

    def total_messages(self, obj):
        return obj.message_count

    total_messages.short_description = "Messages"

    def last_message(self, obj):
        if not obj.last_message:
            return NO_VALUE
        return obj.last_message[:PREVIEW_LENGTH].replace("\n", " ")

    last_message.short_description = "Last message"


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    """Read-only view of the transcript log, mirroring ChunkAdmin."""

    list_display = ("conversation", "role", "preview", "created_at")
    list_filter = ("role",)
    search_fields = ("content", "conversation__title", "conversation__email")
    ordering = ("conversation", "created_at")
    readonly_fields = (
        "conversation",
        "role",
        "content",
        "citations",
        "created_at",
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("conversation")

    def preview(self, obj):
        return obj.content[:PREVIEW_LENGTH].replace("\n", " ")

    preview.short_description = "Content preview"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
