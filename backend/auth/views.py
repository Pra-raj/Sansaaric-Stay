import uuid

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import local
from .models import Profile
from .serializers import (
    AuthResponseSerializer,
    ErrorSerializer,
    LoginSerializer,
    MePayloadSerializer,
    RefreshResponseSerializer,
    RefreshSerializer,
    SignupSerializer,
    serialize_session,
    serialize_user,
)


def _auth_payload(user, session):
    return {
        "user": serialize_user(user),
        "session": serialize_session(session),
        "message": None,
    }


def _unique_username(email):
    base = email[:140]
    username, n = base, 1
    while get_user_model().objects.filter(username=username).exists():
        n += 1
        username = f"{base}-{n}"
    return username


@extend_schema(
    tags=["Auth"],
    request=SignupSerializer,
    responses={
        201: AuthResponseSerializer,
        400: ErrorSerializer,
        409: ErrorSerializer,
    },
)
class SignupView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"]
        if get_user_model().objects.filter(email__iexact=email).exists():
            return Response(
                {"error": "user_already_registered", "detail": "A user with that email already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            user = get_user_model().objects.create_user(
                username=_unique_username(email),
                email=email,
                password=data["password"],
                first_name=data.get("full_name") or "",
            )
            Profile.objects.create(user=user, supabase_uid=uuid.uuid4())
        except IntegrityError:
            # The unique LOWER(email) index is the source of truth; a race past
            # the pre-check lands here instead of minting a duplicate account.
            return Response(
                {"error": "user_already_registered", "detail": "A user with that email already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(_auth_payload(user, local.issue_session(user)), status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Auth"],
    request=LoginSerializer,
    responses={
        200: AuthResponseSerializer,
        400: ErrorSerializer,
        401: ErrorSerializer,
    },
)
class LoginView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = local.authenticate(data["email"], data["password"])
        if user is None:
            return Response(
                {"error": "invalid_credentials", "detail": "Invalid login credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response(_auth_payload(user, local.issue_session(user)))


@extend_schema(
    tags=["Auth"],
    request=RefreshSerializer,
    responses={200: RefreshResponseSerializer, 401: ErrorSerializer},
)
class RefreshView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        claims = local.decode_refresh(serializer.validated_data["refresh_token"])
        if claims is None:
            return Response(
                {"error": "invalid_token", "detail": "Invalid refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        user = get_user_model().objects.filter(pk=claims["sub"], is_active=True).first()
        if user is None:
            return Response(
                {"error": "invalid_token", "detail": "Invalid refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        # The client only stores the refresh token it already has (auth.ts saves
        # the access token alone), so the refresh token is echoed back unchanged.
        session = local.issue_session(user)
        session.refresh_token = serializer.validated_data["refresh_token"]
        return Response({"session": serialize_session(session)})


@extend_schema(
    tags=["Auth"],
    responses={204: None, 401: ErrorSerializer},
)
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Access tokens expire on their own and refresh tokens are stateless,
        # so there is nothing to revoke server-side.
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    tags=["Auth"],
    responses={200: MePayloadSerializer, 401: ErrorSerializer},
)
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        # force_authenticate'd or createsuperuser'd users may have no Profile.
        profile = getattr(user, "profile", None)
        return Response(
            {
                "user": {
                    "id": user.id,
                    "supabase_uid": str(profile.supabase_uid) if profile else "",
                    "email": user.email or "",
                    "full_name": user.first_name or "",
                    "created_at": user.date_joined.isoformat(),
                },
                "role": "admin" if user.is_staff else (profile.role if profile else "guest"),
                "is_staff": bool(user.is_staff),
            }
        )
