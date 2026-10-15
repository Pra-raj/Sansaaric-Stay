"""Repoint conversation titles that were stamped with the visitor's first
question (pre-fix api_chat behavior) at the contact name instead."""

from django.db import migrations


def backfill_question_titles(apps, schema_editor):
    Conversation = apps.get_model("chat", "Conversation")
    Message = apps.get_model("chat", "Message")

    for conversation in Conversation.objects.all():
        first_user_message = Message.objects.filter(
            conversation_id=conversation.pk, role="user"
        ).first()
        if not first_user_message or conversation.title != first_user_message.content[:255]:
            continue
        updates = {}
        if conversation.user_id is None:
            updates["title"] = "Guest"
        else:
            name = (
                f"{conversation.user.first_name} {conversation.user.last_name}".strip()
                or conversation.user.first_name
                or conversation.user.email
                or "Guest"
            )[:255]
            updates["title"] = name
            if not conversation.email:
                updates["email"] = conversation.user.email or ""
        Conversation.objects.filter(pk=conversation.pk).update(**updates)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0004_conversation_channel_conversation_email_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_question_titles, noop),
    ]