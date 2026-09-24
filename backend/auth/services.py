import logging

from django.conf import settings
from supabase_auth.errors import (
    AuthApiError,
    AuthInvalidCredentialsError,
    AuthInvalidJwtError,
    AuthSessionMissingError,
)
from supabase import create_client

logger = logging.getLogger(__name__)


class SupabaseAuthError(Exception):
    def __init__(self, code, detail, status=400):
        self.code = code
        self.detail = detail
        self.status = status
        super().__init__(detail)


class SupabaseAuthService:
    def __init__(self):
        if not settings.SUPABASE_URL or not settings.SUPABASE_PUBLISHABLE_KEY:
            raise SupabaseAuthError(
                "server_not_configured",
                "Supabase auth is not configured on the server.",
                503,
            )
        self._client = create_client(
            settings.SUPABASE_URL, settings.SUPABASE_PUBLISHABLE_KEY
        )

    def sign_up(self, email, password, full_name=None):
        options = {}
        if full_name:
            options["data"] = {"full_name": full_name}
        return self._call(
            lambda: self._client.auth.sign_up(
                {"email": email, "password": password, "options": options}
            )
        )

    def sign_in_with_password(self, email, password):
        return self._call(
            lambda: self._client.auth.sign_in_with_password(
                {"email": email, "password": password}
            )
        )

    def refresh_session(self, refresh_token):
        return self._call(
            lambda: self._client.auth.refresh_session(refresh_token=refresh_token)
        )

    def revoke_session(self, access_token, refresh_token):
        return self._call(
            lambda: (
                self._client.auth.set_session(access_token, refresh_token),
                self._client.auth.sign_out(),
            )
        )

    def _call(self, fn):
        try:
            return fn()
        except AuthInvalidCredentialsError as exc:
            raise SupabaseAuthError("invalid_credentials", str(exc), 401) from exc
        except AuthInvalidJwtError as exc:
            raise SupabaseAuthError("invalid_token", str(exc), 401) from exc
        except AuthSessionMissingError as exc:
            raise SupabaseAuthError("session_missing", str(exc), 401) from exc
        except AuthApiError as exc:
            raise self._map_api_error(exc) from exc
        except SupabaseAuthError:
            raise

    @staticmethod
    def _map_api_error(exc):
        message = str(exc)
        status = getattr(exc, "status", None) or 400
        code = "auth_error"
        lowered = message.lower()
        if "already registered" in lowered:
            code, status = "user_already_registered", 409
        elif "invalid login credentials" in lowered:
            code, status = "invalid_credentials", 401
        return SupabaseAuthError(code, message, status)