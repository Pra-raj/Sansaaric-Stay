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
    # Existing accounts (and Supabase-synced ones, whose email GoTrue already
    # confirmed) default to verified so this migration never locks anyone out.
    # Only the email/password signup flow explicitly creates an unverified
    # profile and must clear the emailed 6-digit code before it can log in.
    email_verified = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.get_username()} ({self.supabase_uid})"


class EmailVerificationCode(models.Model):
    """A single-use 6-digit signup confirmation code.

    Only a keyed hash of the code is stored, so a database leak cannot be used
    to confirm accounts. Issuing a new code retires the previous one: there is
    at most one live code per user at a time.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_verification_codes",
    )
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return f"verification for user {self.user_id}"