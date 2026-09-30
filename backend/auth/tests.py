import json
import time
import uuid
from types import SimpleNamespace
from unittest import mock
import jwt
import yaml
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import SimpleTestCase, TestCase
from rest_framework import exceptions
from rest_framework.test import APIClient, APIRequestFactory
from supabase_auth.errors import AuthApiError

from auth import services
from auth.authentication import SupabaseJWTAuthentication
from auth.models import Profile
from auth.sync import sync_user

User = get_user_model()


class SettingsTest(SimpleTestCase):
    def test_jwks_url_built_from_supabase_url(self):
        self.assertTrue(settings.SUPABASE_JWKS_URL.endswith("/auth/v1/.well-known/jwks.json"))

    def test_default_audience(self):
        self.assertEqual(settings.SUPABASE_JWT_AUDIENCE, "authenticated")


class ProfileModelTest(TestCase):
    def test_profile_links_django_user_to_supabase_uid(self):
        user = User.objects.create_user(username="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", email="a@b.co")
        profile = Profile.objects.create(user=user, supabase_uid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.assertEqual(user.profile, profile)
        self.assertEqual(str(profile.supabase_uid), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")

    def test_supabase_uid_is_unique(self):
        user1 = User.objects.create_user(username="uid-1", email="a@b.co")
        user2 = User.objects.create_user(username="uid-2", email="c@d.co")
        Profile.objects.create(user=user1, supabase_uid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        with self.assertRaises(IntegrityError):
            Profile.objects.create(user=user2, supabase_uid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")


class SupabaseAuthServiceTest(TestCase):
    def _patch_client(self, fake_auth):
        fake_client = SimpleNamespace(auth=fake_auth)
        patcher = mock.patch.object(services, "create_client", return_value=fake_client)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_sign_up_forwards_email_password_and_calls_go_true(self):
        fake = mock.Mock()
        fake.sign_up.return_value = SimpleNamespace(user="USER", session="SESSION")
        self._patch_client(fake)
        svc = services.SupabaseAuthService()
        result = svc.sign_up("a@b.co", "s3cret", full_name="Jane Doe")
        fake.sign_up.assert_called_once_with({
            "email": "a@b.co",
            "password": "s3cret",
            "options": {"data": {"full_name": "Jane Doe"}},
        })
        self.assertEqual(result.user, "USER")

    def test_sign_up_without_full_name_omits_metadata(self):
        fake = mock.Mock()
        fake.sign_up.return_value = SimpleNamespace(user="USER", session=None)
        self._patch_client(fake)
        svc = services.SupabaseAuthService()
        svc.sign_up("a@b.co", "s3cret")
        fake.sign_up.assert_called_once_with({
            "email": "a@b.co",
            "password": "s3cret",
            "options": {},
        })

    def test_unconfigured_server_raises_503(self):
        with mock.patch.object(services.settings, "SUPABASE_PUBLISHABLE_KEY", ""):
            with self.assertRaises(services.SupabaseAuthError) as ctx:
                services.SupabaseAuthService()
        self.assertEqual(ctx.exception.status, 503)

    def test_api_error_number_is_mapped_through(self):
        fake = mock.Mock()
        fake.sign_in_with_password.side_effect = AuthApiError("oops", 429, "unexpected_failure")
        self._patch_client(fake)
        svc = services.SupabaseAuthService()
        with self.assertRaises(services.SupabaseAuthError) as ctx:
            svc.sign_in_with_password("a@b.co", "s3cret")
        self.assertEqual(ctx.exception.code, "auth_error")

    def test_already_registered_is_409(self):
        fake = mock.Mock()
        fake.sign_up.side_effect = AuthApiError("User already registered", 400, "user_already_exists")
        self._patch_client(fake)
        svc = services.SupabaseAuthService()
        with self.assertRaises(services.SupabaseAuthError) as ctx:
            svc.sign_up("a@b.co", "s3cret")
        self.assertEqual(ctx.exception.code, "user_already_registered")
        self.assertEqual(ctx.exception.status, 409)

    def test_refresh_session_and_revoke_session_forward_correctly(self):
        fake = mock.Mock()
        fake.refresh_session.return_value = SimpleNamespace(session="S")
        fake.set_session.return_value = None
        fake.sign_out.return_value = None
        self._patch_client(fake)
        svc = services.SupabaseAuthService()
        self.assertEqual(svc.refresh_session("rt").session, "S")
        fake.refresh_session.assert_called_once_with(refresh_token="rt")
        svc.revoke_session("at", "rt")
        fake.set_session.assert_called_once_with("at", "rt")
        fake.sign_out.assert_called_once()

    def test_profile_cascade_deletes_with_user(self):
        user = User.objects.create_user(username="uid-3", email="a@b.co")
        profile = Profile.objects.create(user=user, supabase_uid="ffffffff-aaaa-bbbb-cccc-dddddddddddd")
        user.delete()
        self.assertFalse(Profile.objects.filter(pk=profile.pk).exists())


class SyncUserTest(TestCase):
    def _sb_user(self, uid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", email="a@b.co", name="Jane Doe"):
        return SimpleNamespace(
            id=uid,
            email=email,
            user_metadata={"full_name": name},
        )

    def test_creates_user_and_profile_keyed_on_uid(self):
        user, profile, created = sync_user(self._sb_user())
        self.assertTrue(created)
        self.assertEqual(user.username, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.assertEqual(user.email, "a@b.co")
        self.assertEqual(user.first_name, "Jane Doe")
        self.assertEqual(str(profile.supabase_uid), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")

    def test_is_idempotent(self):
        first = sync_user(self._sb_user())
        second = sync_user(self._sb_user())
        self.assertEqual(second[0].pk, first[0].pk)
        self.assertEqual(second[1].pk, first[1].pk)
        self.assertFalse(second[2])
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Profile.objects.count(), 1)

    def test_updates_email_on_resync(self):
        sync_user(self._sb_user(email="old@b.co"))
        user, _, created = sync_user(self._sb_user(email="new@b.co"))
        user.refresh_from_db()
        self.assertEqual(user.email, "new@b.co")
        self.assertFalse(created)

    def test_handles_missing_metadata(self):
        supabase_user = SimpleNamespace(id="11111111-2222-3333-4444-555555555555", email="x@y.co", user_metadata={})
        user, _, _ = sync_user(supabase_user)
        self.assertEqual(user.first_name, "")


class SupabaseJWTAuthenticationTest(TestCase):
    def setUp(self):
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.public_key = self.private_key.public_key()
        self.request_factory = APIRequestFactory()
        self.uid = str(uuid.uuid4())

    def _auth(self):
        return SupabaseJWTAuthentication()

    def _patched_request(self, token):
        request = self.request_factory.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {token}")
        stub = SimpleNamespace(get_signing_key_from_jwt=lambda t: SimpleNamespace(key=self.public_key))
        patcher = mock.patch("auth.authentication._get_jwks_client", return_value=stub)
        patcher.start()
        self.addCleanup(patcher.stop)
        return request

    def _token(self, payload_extra=None, header_extra=None, audience="authenticated", expires_in=3600):
        payload = {
            "sub": self.uid,
            "email": "user@example.com",
            "aud": audience,
            "exp": int(time.time()) + expires_in,
            "iat": int(time.time()),
        }
        if payload_extra:
            payload.update(payload_extra)
        headers = {"kid": "test-kid"}
        if header_extra:
            headers.update(header_extra)
        return jwt.encode(payload, self.private_key, algorithm="ES256", headers=headers)

    def test_valid_token_authenticates_and_syncs_user(self):
        token = self._token()
        user, raw = self._auth().authenticate(self._patched_request(token))
        self.assertEqual(user.username, self.uid)
        self.assertEqual(user.email, "user@example.com")
        self.assertEqual(raw, token)
        self.assertTrue(User.objects.filter(username=self.uid).exists())
        self.assertTrue(Profile.objects.filter(supabase_uid=self.uid).exists())

    def test_missing_header_returns_none(self):
        request = self.request_factory.get("/api/auth/me")
        self.assertIsNone(self._auth().authenticate(request))

    def test_wrong_audience_is_rejected(self):
        token = self._token(audience="service_role")
        with self.assertRaises(exceptions.AuthenticationFailed):
            self._auth().authenticate(self._patched_request(token))

    def test_expired_token_is_rejected(self):
        token = self._token(expires_in=-100)
        with self.assertRaises(exceptions.AuthenticationFailed):
            self._auth().authenticate(self._patched_request(token))

    def test_garbage_token_is_rejected(self):
        request = self.request_factory.get("/api/auth/me", HTTP_AUTHORIZATION="Bearer not.a.jwt")
        with self.assertRaises(exceptions.AuthenticationFailed):
            self._auth().authenticate(request)

    def test_missing_sub_is_rejected(self):
        token = self._token(payload_extra={"sub": None})
        with self.assertRaises(exceptions.AuthenticationFailed):
            self._auth().authenticate(self._patched_request(token))


def _fake_supabase_user(email="user@example.com", confirmed=True, name="Jane Doe"):
    return SimpleNamespace(
        id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        email=email,
        confirmed_at="2026-01-01T00:00:00Z" if confirmed else None,
        user_metadata={"full_name": name},
    )


def _fake_session():
    return SimpleNamespace(
        access_token="ACCESS", refresh_token="REFRESH", expires_at=1760000000
    )


class SignupLoginViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _patch_service(self, **methods):
        fake = SimpleNamespace(**methods)
        patcher = mock.patch.object(services, "SupabaseAuthService", return_value=fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def test_signup_with_session_returns_201_and_syncs(self):
        fake = self._patch_service(
            sign_up=lambda email, password, full_name=None: SimpleNamespace(
                user=_fake_supabase_user(), session=_fake_session()
            )
        )
        response = self.client.post(
            "/api/auth/signup",
            {"email": "user@example.com", "password": "s3cret", "full_name": "Jane Doe"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user"]["email"], "user@example.com")
        self.assertTrue(body["user"]["email_confirmed"])
        self.assertEqual(body["session"]["access_token"], "ACCESS")
        self.assertTrue(Profile.objects.filter(supabase_uid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").exists())

    def test_signup_without_confirm_returns_null_session_message(self):
        fake = self._patch_service(
            sign_up=lambda email, password, full_name=None: SimpleNamespace(
                user=_fake_supabase_user(confirmed=False), session=None
            )
        )
        response = self.client.post(
            "/api/auth/signup",
            {"email": "user@example.com", "password": "s3cret"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertIsNone(body["session"])
        self.assertIn("confirm", body["message"].lower())
        self.assertFalse(Profile.objects.exists())

    def test_signup_already_registered_returns_409(self):
        def raise_conflict(**kwargs):
            raise services.SupabaseAuthError("user_already_registered", "User already registered", 409)
        self._patch_service(sign_up=raise_conflict)
        response = self.client.post(
            "/api/auth/signup",
            {"email": "taken@example.com", "password": "s3cret"},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "user_already_registered")

    def test_login_success_returns_access_token_and_syncs(self):
        self._patch_service(
            sign_in_with_password=lambda email, password: SimpleNamespace(
                user=_fake_supabase_user(), session=_fake_session()
            )
        )
        response = self.client.post(
            "/api/auth/login",
            {"email": "user@example.com", "password": "s3cret"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["email"], "user@example.com")
        self.assertEqual(response.json()["session"]["refresh_token"], "REFRESH")
        self.assertTrue(User.objects.filter(username="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").exists())

    def test_login_invalid_credentials_returns_401(self):
        def reject(**kwargs):
            raise services.SupabaseAuthError("invalid_credentials", "Invalid login credentials", 401)
        self._patch_service(sign_in_with_password=reject)
        response = self.client.post(
            "/api/auth/login",
            {"email": "nope@example.com", "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "invalid_credentials")


class RefreshLogoutMeViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _patch_service(self, **methods):
        fake = SimpleNamespace(**methods)
        patcher = mock.patch.object(services, "SupabaseAuthService", return_value=fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def _sync_user(self, uid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", email="user@example.com"):
        from auth.sync import sync_user
        return sync_user(
            SimpleNamespace(id=uid, email=email, user_metadata={"full_name": "Jane Doe"})
        )[0]

    def test_refresh_returns_new_session(self):
        fake = self._patch_service(
            refresh_session=lambda refresh_token: SimpleNamespace(
                session=_fake_session()
            )
        )
        response = self.client.post(
            "/api/auth/refresh", {"refresh_token": "OLD"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["session"]["refresh_token"], "REFRESH")

    def test_refresh_invalid_token_returns_401(self):
        def reject(refresh_token):
            raise services.SupabaseAuthError("invalid_token", "Invalid refresh token", 401)
        self._patch_service(refresh_session=reject)
        response = self.client.post(
            "/api/auth/refresh", {"refresh_token": "BAD"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "invalid_token")

    def test_logout_requires_authentication(self):
        response = self.client.post("/api/auth/logout", {}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_logout_revokes_session_and_returns_204(self):
        fake = self._patch_service(revoke_session=mock.Mock(return_value=None))
        user = self._sync_user()
        self.client.force_authenticate(user=user, token="RAW-ACCESS-TOKEN")
        response = self.client.post(
            "/api/auth/logout", {"refresh_token": "RT"}, format="json"
        )
        self.assertEqual(response.status_code, 204)
        fake.revoke_session.assert_called_once_with("RAW-ACCESS-TOKEN", "RT")

    def test_logout_without_refresh_token_still_returns_204(self):
        fake = self._patch_service(revoke_session=mock.Mock(return_value=None))
        user = self._sync_user()
        self.client.force_authenticate(user=user, token="RAW-ACCESS-TOKEN")
        response = self.client.post("/api/auth/logout", {}, format="json")
        self.assertEqual(response.status_code, 204)
        fake.revoke_session.assert_not_called()

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_synced_user(self):
        self._sync_user()
        user = User.objects.get(username="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        body = response.json()["user"]
        self.assertEqual(body["supabase_uid"], "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.assertEqual(body["email"], "user@example.com")
        self.assertEqual(body["full_name"], "Jane Doe")


class ApiDocsTest(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    def test_schema_endpoint_returns_openapi(self):
        response = self.client.get("/api/schema/")
        self.assertEqual(response.status_code, 200)
        body = yaml.safe_load(response.content)
        self.assertEqual(body["openapi"].split(".")[0], "3")
        self.assertEqual(body["info"]["title"], "Sansaaric Stay API")

    def test_swagger_ui_renders(self):
        response = self.client.get("/api/schema/swagger-ui/")
        self.assertEqual(response.status_code, 200)
