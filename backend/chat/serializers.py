"""Serializers for the staff admin inbox API.

Deliberately thin read models over `chat.Conversation`/`Message` so the Next.js
admin has one documented JSON shape to code against.
"""

from rest_framework import serializers

from .models import Conversation


class ContactFieldsMixin:
    """Contact name + email fallbacks shared by the list and thread shapes."""

    def get_contact_name(self, conversation):
        # Derive the name from the live account so a re-named user is reflected
        # immediately; anonymous chats read the stamped title ("Guest" by
        # default) since they have no account to read from.
        user = conversation.user
        if user:
            return user.get_full_name() or user.email or "Guest"
        return conversation.title or "Guest"

    def get_email(self, conversation):
        if conversation.email:
            return conversation.email
        if conversation.user and conversation.user.email:
            return conversation.user.email
        return ""


class InboxMessageSerializer(ContactFieldsMixin, serializers.ModelSerializer):
    """One row in the inbox list.

    `contact_name`, `snippet` and `last_message_at` are annotated onto the
    queryset (see views.inbox_rows) rather than read in Python, so rendering a
    full page of rows stays one query.
    """

    id = serializers.CharField()
    contact_name = serializers.SerializerMethodField()
    last_message_at = serializers.DateTimeField(read_only=True)
    snippet = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "title", "channel", "email", "phone",
            "note", "contact_name", "last_message_at", "snippet",
        ]
        read_only_fields = fields

    def get_snippet(self, conversation):
        return (conversation.last_message_content or "")[:120]


class InboxEntrySerializer(serializers.Serializer):
    """One bubble in a thread.

    Declared rather than generated because `from` is a Python keyword and
    cannot be a field name in a ModelSerializer; `to_representation` renames it.
    """

    id = serializers.IntegerField()
    from_field = serializers.SerializerMethodField()
    body = serializers.CharField(source="content")
    sentAt = serializers.DateTimeField(source="created_at")
    citations = serializers.SerializerMethodField()

    def get_from_field(self, message):
        if message.role == "user":
            return "guest"
        return "bot"

    def get_citations(self, message):
        return message.citations or []

    def to_representation(self, message):
        data = super().to_representation(message)
        data["from"] = data.pop("from_field")
        return data


class InboxThreadSerializer(ContactFieldsMixin, serializers.ModelSerializer):
    """Conversation + its full message history."""

    id = serializers.CharField()
    contact_name = serializers.SerializerMethodField()
    entries = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "title", "channel", "email", "phone",
            "note", "contact_name", "created_at", "updated_at", "entries",
        ]
        read_only_fields = fields

    def get_entries(self, conversation):
        return InboxEntrySerializer(
            conversation.messages.order_by("created_at"), many=True
        ).data


class InboxReplySerializer(serializers.Serializer):
    content = serializers.CharField(max_length=4000, trim_whitespace=True)


class InboxContactUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    channel = serializers.ChoiceField(choices=Conversation.CHANNEL_CHOICES, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)


class InboxCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ["title", "channel", "email", "phone", "note"]

    def create(self, validated_data):
        return Conversation.objects.create(**validated_data)
