"""Credentials checked against Django's ``auth_user``, plus the JWTs we mint.

The frontend contract is Supabase-shaped — ``{access_token, refresh_token,
expires_at}`` — but nothing here talks to GoTrue: the seed accounts live in
``auth_user``, so that is where a password is checked.
"""

import hashlib
import time
from types import SimpleNamespace

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

ALGORITHM = "HS256"
ACCESS_TTL = 60 * 60
REFRESH_TTL = 7 * 24 * 60 * 60

# SECRET_KEY may be shorter than HS256's 32-byte minimum; hash it so the
# signing key always meets RFC 7518 and PyJWT stays quiet.
_SIGNING_KEY = hashlib.sha256(settings.SECRET_KEY.encode()).digest()

# Costs the same as a real check when no account matches, so response time
# doesn't reveal whether an email is registered. Not a usable password.
_DUMMY_HASH = (
    "pbkdf2_sha256$1000000$IHvmQyStdatvQf6Skb0Ih8$"
    "QwcE48ch+t2lvfgDC/rKx4Bnzd+Ff/Qv9eCrEqcW6JU="
)

# ponytail: refresh tokens are stateless, so logout cannot revoke one — a
# jti column + deny-list is the upgrade path if that ever matters.


def authenticate(email, password):
    """Return an active user, or None. Accepts an email or a username."""
    if not email or not password:
        return None
    user = (
        get_user_model()
        .objects.filter(
            Q(email__iexact=email) | Q(username__iexact=email), is_active=True
        )
        .first()
    )
    stored = user.password if user is not None else _DUMMY_HASH
    if not check_password(password, stored):
        return None
    return user


def issue_session(user):
    now = int(time.time())
    claims = {
        "sub": str(user.pk),
        "email": user.email or "",
        "full_name": user.first_name or "",
    }
    access = jwt.encode(
        {**claims, "typ": "access", "iat": now, "exp": now + ACCESS_TTL},
        _SIGNING_KEY,
        algorithm=ALGORITHM,
    )
    refresh = jwt.encode(
        {"sub": str(user.pk), "typ": "refresh", "iat": now, "exp": now + REFRESH_TTL},
        _SIGNING_KEY,
        algorithm=ALGORITHM,
    )
    return SimpleNamespace(
        access_token=access, refresh_token=refresh, expires_at=now + ACCESS_TTL
    )


def decode_access(token):
    claims = _decode(token)
    if claims is None or claims.get("typ") != "access" or not claims.get("sub"):
        return None
    return claims


def decode_refresh(token):
    claims = _decode(token)
    if claims is None or claims.get("typ") != "refresh" or not claims.get("sub"):
        return None
    return claims


# Password reset tokens are Django's default_token_generator: they embed a
# timestamp + password hash, so they expire (PASSWORD_RESET_TIMEOUT) and stop
# working automatically once the password changes. No extra table needed.

def password_reset_uid(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def password_reset_token(user):
    return default_token_generator.make_token(user)


def user_from_reset_uid(uidb64):
    """Resolve the uid half of a reset link, or None if it is malformed."""
    try:
        pk = force_str(urlsafe_base64_decode(uidb64))
    except (TypeError, ValueError, OverflowError, ValidationError):
        return None
    # Django's default user pk is an int; anything else can't match.
    if not pk.isdigit():
        return None
    return get_user_model().objects.filter(pk=pk, is_active=True).first()


def reset_token_is_valid(user, token):
    return default_token_generator.check_token(user, token)


def _decode(token):
    try:
        return jwt.decode(token, _SIGNING_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
