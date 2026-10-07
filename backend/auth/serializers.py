from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework import serializers


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(max_length=128, write_only=True)
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=150)

    def validate_password(self, value):
        # Enforce the configured AUTH_PASSWORD_VALIDATORS server-side so the
        # API and the frontend agree on password rules (supersedes the old
        # min_length=6 floor, which let in passwords the UI couldn't log in).
        try:
            validate_password(value)
        except ValidationError as exc:
            raise serializers.ValidationError(" ".join(exc.messages))
        return value


class LoginSerializer(serializers.Serializer):
    # Accept a username too, not just an email: auth_user lookup matches both.
    email = serializers.CharField()
    password = serializers.CharField()


class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class SessionSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    expires_at = serializers.IntegerField()


class UserSummarySerializer(serializers.Serializer):
    # serialize_user() always returns a string id (Django ints, GoTrue UUIDs).
    id = serializers.CharField()
    email = serializers.EmailField()
    email_confirmed = serializers.BooleanField()
    full_name = serializers.CharField()


class AuthResponseSerializer(serializers.Serializer):
    user = UserSummarySerializer()
    session = SessionSerializer(allow_null=True)
    message = serializers.CharField(allow_null=True)


class RefreshResponseSerializer(serializers.Serializer):
    session = SessionSerializer()


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    supabase_uid = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    created_at = serializers.DateTimeField()


class MePayloadSerializer(serializers.Serializer):
    user = MeSerializer()
    # Convenience top-level role so clients can gate an area without walking into
    # user.*. "admin" is granted by Django's is_staff flag, never by Profile.role.
    role = serializers.CharField()
    is_staff = serializers.BooleanField()


class ErrorSerializer(serializers.Serializer):
    error = serializers.CharField()
    detail = serializers.CharField()


def serialize_user(user):
    # Duck-type both GoTrue users (SimpleNamespace with user_metadata) and the
    # Django users created by the local auth path.
    full_name = getattr(user, "first_name", "") or ""
    metadata = getattr(user, "user_metadata", None)
    if isinstance(metadata, dict) and metadata.get("full_name"):
        full_name = str(metadata["full_name"])
    return {
        "id": str(getattr(user, "id", "")),
        "email": getattr(user, "email", "") or "",
        "email_confirmed": bool(getattr(user, "confirmed_at", None) or getattr(user, "email", "")),
        "full_name": full_name,
    }


def serialize_session(session):
    if session is None:
        return None
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_at": int(session.expires_at),
    }