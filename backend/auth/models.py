from django.conf import settings
from django.db import models


class Profile(models.Model):
    ROLE_GUEST = "guest"
    ROLE_HOTEL_OWNER = "hotel_owner"
    ROLE_CHOICES = [
        (ROLE_GUEST, "Guest"),
        (ROLE_HOTEL_OWNER, "Hotel owner"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    supabase_uid = models.UUIDField(unique=True)
    role = models.CharField(
        max_length=20, choices=ROLE_CHOICES, default=ROLE_GUEST,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.get_username()} ({self.supabase_uid})"