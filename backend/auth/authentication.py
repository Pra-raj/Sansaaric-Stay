from types import SimpleNamespace

import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

from .sync import sync_user

_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(settings.SUPABASE_JWKS_URL, cache_keys=True)
    return _jwks_client


class SupabaseJWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).split()
        if not header or header[0].lower() != self.keyword.lower().encode():
            return None
        if len(header) != 2:
            raise exceptions.AuthenticationFailed("Invalid authorization header")
        token = header[1].decode()
        claims = self._decode_token(token)
        if not claims.get("sub"):
            raise exceptions.AuthenticationFailed("Invalid or expired token")
        supabase_user = SimpleNamespace(
            id=claims["sub"],
            email=claims.get("email", ""),
            user_metadata={"full_name": claims.get("full_name", "")},
        )
        user, _, _ = sync_user(supabase_user)
        return (user, token)

    def authenticate_header(self, request):
        return self.keyword

    def _decode_token(self, token):
        try:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience=settings.SUPABASE_JWT_AUDIENCE,
                options={"verify_sub": False},
            )
        except exceptions.AuthenticationFailed:
            raise
        except Exception:
            raise exceptions.AuthenticationFailed("Invalid or expired token")