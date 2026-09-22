from django.conf import settings
from django.db import models


class Conversation(models.Model):
    CHANNEL_CHOICES = [
        ("Website", "Website"),
        ("Facebook", "Facebook"),
        ("Instagram", "Instagram"),
        ("WhatsApp", "WhatsApp"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="conversations",
        on_delete=models.CASCADE,
    )
    session_key = models.CharField(max_length=40, blank=True, default="", db_index=True)
    title = models.CharField(max_length=255, default="New chat")
    channel = models.CharField(
        max_length=20,
        choices=CHANNEL_CHOICES,
        default="Website",
    )
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    note = models.TextField(blank=True, default="")
    is_human = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        owner = self.user.username if self.user else "Anonymous"
        return f"{self.title} ({owner})"


class Message(models.Model):
    ROLE_CHOICES = [
        ("user", "User"),
        ("assistant", "Assistant"),
    ]

    conversation = models.ForeignKey(
        Conversation,
        related_name="messages",
        on_delete=models.CASCADE,
    )
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    content = models.TextField()
    citations = models.JSONField(default=list, blank=True)
    is_human = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.get_role_display()}: {self.content[:60]}"