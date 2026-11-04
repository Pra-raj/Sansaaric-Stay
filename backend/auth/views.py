import logging
import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import emails, local, verification
from .models import Profile
from .serializers import (
    AuthResponseSerializer,
    ErrorSerializer,
    LoginSerializer,
    MePayloadSerializer,
    MessageSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RefreshResponseSerializer,
    RefreshSerializer,
    ResendVerificationSerializer,
    SignupSerializer,
    VerifyEmailSerializer,
    serialize_session,
    serialize_user,
)

logger = logging.getLogger(__name__)


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


SIGNUP_VERIFICATION_MESSAGE = (
    "We emailed a 6-digit confirmation code to {email}. "
    "Enter it to activate your account."
)
RESEND_VERIFICATION_MESSAGE = (
    "If that account is waiting for confirmation, we've sent a new code."
)


def _send_verification_code(user):
    """Issue and email a fresh code. Returns False when delivery failed."""
    code = verification.issue_code(user)
    try:
        emails.send_verification_code(user, code)
    except Exception:
        # The account already exists, so a 500 here would strand the user on a
        # login screen with no working code. Log it; the UI offers "Resend".
        logger.exception("Confirmation email failed for user %s", user.pk)
        return False
    return True


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
            Profile.objects.create(
                user=user, supabase_uid=uuid.uuid4(), email_verified=False
            )
        except IntegrityError:
            # The unique LOWER(email) index is the source of truth; a race past
            # the pre-check lands here instead of minting a duplicate account.
            return Response(
                {"error": "user_already_registered", "detail": "A user with that email already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        _send_verification_code(user)
        # No session until the emailed code is confirmed: a stolen password is
        # useless against an address the attacker does not control.
        return Response(
            {
                "user": serialize_user(user),
                "session": None,
                "message": SIGNUP_VERIFICATION_MESSAGE.format(email=email),
            },
            status=status.HTTP_201_CREATED,
        )


INVALID_CODE_DETAIL = "That confirmation code is invalid or has expired."


@extend_schema(
    tags=["Auth"],
    request=VerifyEmailSerializer,
    responses={
        200: AuthResponseSerializer,
        400: ErrorSerializer,
    },
)
class VerifyEmailView(APIView):
    """Confirm a signup email with the 6-digit code and return a session."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = (
            get_user_model()
            .objects.filter(email__iexact=data["email"], is_active=True)
            .first()
        )
        if user is None:
            # Same generic answer as a wrong code: never reveal which addresses
            # have accounts from an endpoint that takes only an email guess.
            return Response(
                {"error": "invalid_code", "detail": INVALID_CODE_DETAIL},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if verification.email_is_verified(user):
            return Response(_auth_payload(user, local.issue_session(user)))
        ok, reason = verification.verify_code(user, data["code"])
        if not ok:
            detail = {
                "missing": "No confirmation code is pending for that email. Request a new one.",
                "expired": "That code has expired. Request a new one.",
                "too_many": "Too many incorrect attempts. Request a new code.",
                "invalid": "That code isn't right. Check the email and try again.",
            }.get(reason, INVALID_CODE_DETAIL)
            return Response(
                {"error": "invalid_code", "detail": detail},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(_auth_payload(user, local.issue_session(user)))


@extend_schema(
    tags=["Auth"],
    request=ResendVerificationSerializer,
    responses={200: MessageSerializer, 400: ErrorSerializer},
)
class ResendVerificationView(APIView):
    """Email a fresh confirmation code (silently rate-limited per account)."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = (
            get_user_model()
            .objects.filter(email__iexact=email, is_active=True)
            .first()
        )
        if (
            user is not None
            and not verification.email_is_verified(user)
            and verification.seconds_until_resend(user) == 0
        ):
            _send_verification_code(user)
        # Identical body for known/unknown/already-verified addresses.
        return Response(
            {"detail": RESEND_VERIFICATION_MESSAGE, "email": email}
        )


@extend_schema(
    tags=["Auth"],
    request=LoginSerializer,
    responses={
        200: AuthResponseSerializer,
        400: ErrorSerializer,
        401: ErrorSerializer,
        403: ErrorSerializer,
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
        if not verification.email_is_verified(user):
            return Response(
                {
                    "error": "email_not_verified",
                    "detail": (
                        "Confirm your email before logging in. Enter the "
                        "6-digit code we emailed you, or request a new one."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
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


RESET_REQUEST_MESSAGE = (
    "If an account exists for that email, we've sent a link to reset the password."
)


@extend_schema(
    tags=["Auth"],
    request=PasswordResetRequestSerializer,
    responses={200: MessageSerializer, 400: ErrorSerializer},
)
class PasswordResetRequestView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip()
        payload = {"detail": RESET_REQUEST_MESSAGE}
        user = (
            get_user_model().objects.filter(email__iexact=email, is_active=True).first()
        )
        if user is None:
            # Same body as the found-user case: never reveal which emails exist.
            return Response(payload)
        reset_url = (
            f"{settings.FRONTEND_URL}/reset-password"
            f"?uid={local.password_reset_uid(user)}&token={local.password_reset_token(user)}"
        )
        try:
            emails.send_password_reset_link(user, reset_url)
        except Exception:
            # A delivery failure must not turn into a 500: that would reveal
            # which addresses have accounts. Log it for operators instead.
            logger.exception("Password reset email failed for user %s", user.pk)
        if settings.DEBUG:
            # Lets the whole flow be tested without an SMTP server. Never sent
            # outside DEBUG: the token is a credential.
            payload["reset_url"] = reset_url
        return Response(payload)


@extend_schema(
    tags=["Auth"],
    request=PasswordResetConfirmSerializer,
    responses={200: MessageSerializer, 400: ErrorSerializer},
)
class PasswordResetConfirmView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = local.user_from_reset_uid(data["uid"])
        if user is None or not local.reset_token_is_valid(user, data["token"]):
            return Response(
                {
                    "error": "invalid_token",
                    "detail": "That reset link is invalid or has expired. Request a new one.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(data["password"])
        user.save(update_fields=["password"])
        # Opening the emailed link proves control of the address, so a reset
        # also clears the "confirm your signup" gate.
        verification.mark_email_verified(user)
        return Response({"detail": "Your password has been updated. You can log in now."})


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
