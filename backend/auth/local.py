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
from django.db.models import Q

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


def _decode(token):
    try:
        return jwt.decode(token, _SIGNING_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
