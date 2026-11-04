"""Email confirmation codes for the email/password signup flow.

The code is six digits, expires quickly, allows only a handful of guesses and
is single-use. Only a keyed hash is stored: the plain code exists in the email
and in memory long enough to send it, never in the database.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import EmailVerificationCode

CODE_LENGTH = 6


def _code_hash(user, code):
    return hmac.new(
        settings.SECRET_KEY.encode(),
        f"{user.pk}:{code}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _ttl():
    return timedelta(minutes=settings.EMAIL_VERIFICATION_TIMEOUT_MINUTES)


def email_is_verified(user):
    """True unless a signup explicitly created an unverified Profile."""
    profile = getattr(user, "profile", None)
    if profile is None:
        # No Profile row (createsuperuser, legacy account) is not part of the
        # email/password signup flow, so it is not blocked.
        return True
    return bool(profile.email_verified)


def mark_email_verified(user):
    # Update the instance the caller already holds when it is cached, so a
    # response serialized from the same user object reports the new state
    # (queryset.update() leaves an embedded profile stale).
    profile = getattr(user, "profile", None)
    if profile is None or profile.email_verified:
        return
    profile.email_verified = True
    profile.save(update_fields=["email_verified"])


def issue_code(user):
    """Retire any previous code and return a fresh plain-text code to email."""
    EmailVerificationCode.objects.filter(user=user).delete()
    code = f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"
    EmailVerificationCode.objects.create(user=user, code_hash=_code_hash(user, code))
    return code


def latest_code(user):
    return (
        EmailVerificationCode.objects.filter(user=user)
        .order_by("-created_at")
        .first()
    )


def seconds_until_resend(user):
    """Remaining cooldown before another code may be emailed (0 when free)."""
    record = latest_code(user)
    if record is None:
        return 0
    elapsed = (timezone.now() - record.created_at).total_seconds()
    return max(0, int(settings.EMAIL_VERIFICATION_RESEND_SECONDS - elapsed))


def verify_code(user, code):
    """Return ``(ok, reason)``; reason is one of missing/expired/too_many/invalid."""
    record = latest_code(user)
    if record is None:
        return False, "missing"
    if record.consumed_at is not None:
        return False, "missing"
    if record.created_at + _ttl() < timezone.now():
        return False, "expired"
    if record.attempts >= settings.EMAIL_VERIFICATION_MAX_ATTEMPTS:
        return False, "too_many"
    # Burn the attempt before comparing so a burst cannot be replayed if the
    # process dies mid-request.
    EmailVerificationCode.objects.filter(pk=record.pk).update(
        attempts=record.attempts + 1
    )
    if not hmac.compare_digest(record.code_hash, _code_hash(user, code)):
        return False, "invalid"
    record.consumed_at = timezone.now()
    record.save(update_fields=["consumed_at"])
    mark_email_verified(user)
    return True, None
