import logging

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import (
    AuthResponseSerializer,
    ErrorSerializer,
    LoginSerializer,
    LogoutSerializer,
    MePayloadSerializer,
    RefreshResponseSerializer,
    RefreshSerializer,
    SignupSerializer,
    serialize_session,
    serialize_user,
)
from .sync import sync_user


def _auth_payload(supabase_user, session):
    return {
        "user": serialize_user(supabase_user),
        "session": serialize_session(session),
        "message": None,
    }


@extend_schema(
    tags=["Auth"],
    request=SignupSerializer,
    responses={
        201: AuthResponseSerializer,
        400: ErrorSerializer,
        409: ErrorSerializer,
        503: ErrorSerializer,
    },
)
class SignupView(APIView):
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            resp = services.SupabaseAuthService().sign_up(
                email=data["email"], password=data["password"], full_name=data.get("full_name")
            )
        except services.SupabaseAuthError as exc:
            return Response({"error": exc.code, "detail": exc.detail}, status=exc.status)
        if resp.session is None:
            return Response(
                {
                    "user": serialize_user(resp.user),
                    "session": None,
                    "message": "Check your email to confirm your account.",
                },
                status=status.HTTP_201_CREATED,
            )
        sync_user(resp.user)
        return Response(_auth_payload(resp.user, resp.session), status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Auth"],
    request=LoginSerializer,
    responses={
        200: AuthResponseSerializer,
        400: ErrorSerializer,
        401: ErrorSerializer,
        503: ErrorSerializer,
    },
)
class LoginView(APIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            resp = services.SupabaseAuthService().sign_in_with_password(
                email=data["email"], password=data["password"]
            )
        except services.SupabaseAuthError as exc:
            return Response({"error": exc.code, "detail": exc.detail}, status=exc.status)
        sync_user(resp.user)
        return Response(_auth_payload(resp.user, resp.session))


@extend_schema(
    tags=["Auth"],
    request=RefreshSerializer,
    responses={200: RefreshResponseSerializer, 401: ErrorSerializer},
)
class RefreshView(APIView):
    def post(self, request):
        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh_token = serializer.validated_data["refresh_token"]
        try:
            resp = services.SupabaseAuthService().refresh_session(refresh_token)
        except services.SupabaseAuthError as exc:
            return Response({"error": exc.code, "detail": exc.detail}, status=exc.status)
        if resp.session is None:
            return Response(
                {"error": "session_missing", "detail": "No session returned."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response({"session": serialize_session(resp.session)})


@extend_schema(
    tags=["Auth"],
    request=LogoutSerializer,
    responses={204: None, 401: ErrorSerializer},
)
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = (request.data or {}).get("refresh_token", "")
        if request.auth and refresh_token:
            try:
                services.SupabaseAuthService().revoke_session(request.auth, refresh_token)
            except services.SupabaseAuthError:
                # Revocation failure is tolerated/logged; the access token still expires.
                logging.getLogger(__name__).warning(
                    "Supabase session revocation failed for user %s", request.user.get_username()
                )
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    tags=["Auth"],
    responses={200: MePayloadSerializer, 401: ErrorSerializer},
)
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "user": {
                    "id": user.id,
                    "supabase_uid": str(user.profile.supabase_uid),
                    "email": user.email or "",
                    "full_name": user.first_name or "",
                    "created_at": user.date_joined.isoformat(),
                }
            }
        )