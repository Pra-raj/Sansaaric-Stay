from rest_framework import serializers


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=6)
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=150)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh_token = serializers.CharField(required=False)


class SessionSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    expires_at = serializers.IntegerField()


class UserSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
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


class ErrorSerializer(serializers.Serializer):
    error = serializers.CharField()
    detail = serializers.CharField()


def serialize_user(supabase_user):
    full_name = ""
    metadata = getattr(supabase_user, "user_metadata", None)
    if isinstance(metadata, dict) and metadata.get("full_name"):
        full_name = str(metadata["full_name"])
    return {
        "id": str(supabase_user.id),
        "email": getattr(supabase_user, "email", "") or "",
        "email_confirmed": bool(getattr(supabase_user, "confirmed_at", None)),
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