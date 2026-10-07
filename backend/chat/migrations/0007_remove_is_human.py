from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0006_message_chat_message_role_created_idx"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="conversation",
            name="is_human",
        ),
        migrations.RemoveField(
            model_name="message",
            name="is_human",
        ),
    ]