import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
import jwt
import yaml
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError
from django.test import SimpleTestCase, TestCase
from rest_framework import exceptions
from rest_framework.test import APIClient, APIRequestFactory

from auth import local
from auth.authentication import LocalJWTAuthentication, SupabaseJWTAuthentication
from auth.models import Profile
from auth.sync import sync_user

User = get_user_model()


class SettingsTest(SimpleTestCase):
    def test_jwks_url_built_from_supabase_url(self):
        self.assertTrue(settings.SUPABASE_JWKS_URL.endswith("/auth/v1/.well-known/jwks.json"))

    def test_default_audience(self):
        self.assertEqual(settings.SUPABASE_JWT_AUDIENCE, "authenticated")

    # S1/A5 run against a fresh import of the settings module, because the
    # values under test are read once at import time. backend/.env loading is
    # disabled in the child so a developer's local file can't mask a defect.

    BACKEND_DIR = Path(__file__).resolve().parent.parent

    def _import_settings(self, body, env=None):
        code = (
            "import os, sys\n"
            "sys.path.insert(0, os.environ['BACKEND_DIR'])\n"
            "import dotenv\n"
            "dotenv.load_dotenv = lambda *a, **k: None\n" + body
        )
        child_env = dict(os.environ, BACKEND_DIR=str(self.BACKEND_DIR))
        child_env.pop("DJANGO_SECRET_KEY", None)
        child_env.pop("DJANGO_DEBUG", None)
        child_env.update(env or {})
        return subprocess.run(
            [sys.executable, "-c", code],
            env=child_env,
            capture_output=True,
            text=True,
            timeout=60,
        )

    @staticmethod
    def _probe(code):
        return (
            "try:\n"
            f"    {code}\n"
            "except Exception as exc:\n"
            "    print(type(exc).__name__)\n"
            "else:\n"
            "    print('imported')\n"
        )

    def test_missing_secret_key_fails_closed(self):
        result = self._import_settings(self._probe("import config.settings"))
        self.assertEqual(result.stdout.strip(), "ImproperlyConfigured", result.stderr)

    def test_insecure_default_secret_key_is_rejected(self):
        for default in ("local-dev-key", "change_me"):
            with self.subTest(secret=default):
                result = self._import_settings(
                    self._probe("import config.settings"),
                    {"DJANGO_SECRET_KEY": default},
                )
                self.assertEqual(
                    result.stdout.strip(), "ImproperlyConfigured", result.stderr
                )

    def test_debug_defaults_off(self):
        result = self._import_settings(
            "import config.settings as s\nprint('DEBUG=' + str(s.DEBUG))\n",
            {"DJANGO_SECRET_KEY": "x" * 50},
        )
        self.assertEqual(result.stdout.strip(), "DEBUG=False", result.stderr)

    def test_debug_can_be_switched_on_explicitly(self):
        result = self._import_settings(
            "import config.settings as s\nprint('DEBUG=' + str(s.DEBUG))\n",
            {"DJANGO_SECRET_KEY": "x" * 50, "DJANGO_DEBUG": "1"},
        )
        self.assertEqual(result.stdout.strip(), "DEBUG=True", result.stderr)


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


class SyncUserTest(TestCase):
    def test_profile_cascade_deletes_with_user(self):
        user = User.objects.create_user(username="uid-3", email="a@b.co")
        profile = Profile.objects.create(user=user, supabase_uid="ffffffff-aaaa-bbbb-cccc-dddddddddddd")
        user.delete()
        self.assertFalse(Profile.objects.filter(pk=profile.pk).exists())

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


class LocalJWTAuthenticationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="loki", email="loki@example.com", password="pw")
        self.request_factory = APIRequestFactory()

    def _auth(self):
        return LocalJWTAuthentication()

    def _request(self, token=None):
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
        return self.request_factory.get("/api/auth/me", **headers)

    def test_valid_token_authenticates(self):
        token = local.issue_session(self.user).access_token
        user, raw = self._auth().authenticate(self._request(token))
        self.assertEqual(user, self.user)
        self.assertEqual(raw, token)

    def test_missing_header_returns_none(self):
        self.assertIsNone(self._auth().authenticate(self._request()))

    def test_non_local_token_returns_none(self):
        self.assertIsNone(self._auth().authenticate(self._request("not.a.real.jwt")))

    def test_refresh_token_is_not_an_access_token(self):
        refresh = local.issue_session(self.user).refresh_token
        self.assertIsNone(self._auth().authenticate(self._request(refresh)))

    def test_expired_token_is_rejected(self):
        # A9: sign with the real key (sha256(SECRET_KEY)) so only `exp` is
        # wrong — the previous raw-SECRET_KEY signature failed verification
        # before ever reaching the expiry check. Prove the signature/claims
        # are otherwise valid, then that expiry is what rejects the token.
        token = jwt.encode(
            {
                "sub": str(self.user.pk), "typ": "access",
                "iat": int(time.time()) - 200, "exp": int(time.time()) - 100,
            },
            local._SIGNING_KEY, algorithm="HS256",
        )
        verified = jwt.decode(token, local._SIGNING_KEY, algorithms=["HS256"],
                              options={"verify_exp": False})
        self.assertEqual(verified["sub"], str(self.user.pk))
        # Expired local tokens are deferred to the next authenticator, so
        # LocalJWT returns None (does not authenticate them).
        self.assertIsNone(self._auth().authenticate(self._request(token)))

    def test_inactive_user_is_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        token = local.issue_session(self.user).access_token
        with self.assertRaises(exceptions.AuthenticationFailed):
            self._auth().authenticate(self._request(token))


class SignupLoginViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        # The A1 auth throttle is 10/min per IP; every test here shares
        # 127.0.0.1, so without a reset the history bleeds across tests.
        cache.clear()

    def test_signup_creates_user_and_returns_session(self):
        response = self.client.post(
            "/api/auth/signup",
            {"email": "jane@example.com", "password": "Sunrise-Lodge-7", "full_name": "Jane Doe"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user"]["email"], "jane@example.com")
        self.assertTrue(body["user"]["email_confirmed"])
        user = User.objects.get(email="jane@example.com")
        self.assertTrue(Profile.objects.filter(user=user).exists())
        claims = local.decode_access(body["session"]["access_token"])
        self.assertEqual(claims["sub"], str(user.pk))

    def test_signup_without_name_uses_empty_first_name(self):
        response = self.client.post(
            "/api/auth/signup",
            {"email": "no-name@example.com", "password": "Sunrise-Lodge-7"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(email="no-name@example.com").first_name, "")

    def test_signup_taken_email_returns_409(self):
        User.objects.create_user(username="taken", email="taken@example.com", password="pw")
        response = self.client.post(
            "/api/auth/signup",
            {"email": "taken@example.com", "password": "Sunrise-Lodge-7"},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "user_already_registered")

    def test_signup_weak_password_rejected(self):
        # A2: AUTH_PASSWORD_VALIDATORS run server-side, so a password the UI
        # would reject never creates an account.
        response = self.client.post(
            "/api/auth/signup",
            {"email": "weak@example.com", "password": "s3cret"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="weak@example.com").exists())

    def test_login_by_email_returns_access_token(self):
        User.objects.create_user(
            username="demo.admin", email="demo.admin@sansaaric.com", password="SuperAdmin@123"
        )
        response = self.client.post(
            "/api/auth/login",
            {"email": "demo.admin@sansaaric.com", "password": "SuperAdmin@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["user"]["email"], "demo.admin@sansaaric.com")
        self.assertTrue(body["session"]["access_token"])
        self.assertTrue(body["session"]["refresh_token"])

    def test_login_by_username_works(self):
        User.objects.create_user(
            username="demo.admin", email="demo.admin@sansaaric.com", password="SuperAdmin@123"
        )
        response = self.client.post(
            "/api/auth/login",
            {"email": "demo.admin", "password": "SuperAdmin@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_login_wrong_password_returns_401(self):
        User.objects.create_user(
            username="demo.admin", email="demo.admin@sansaaric.com", password="SuperAdmin@123"
        )
        response = self.client.post(
            "/api/auth/login",
            {"email": "demo.admin@sansaaric.com", "password": "wrong-pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "invalid_credentials")

    def test_login_unknown_account_returns_401(self):
        response = self.client.post(
            "/api/auth/login",
            {"email": "nobody@example.com", "password": "s3cret"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_login_scope_returns_429_after_n_attempts(self):
        # A1: the `auth` scope (10/min per IP) stops credential stuffing.
        statuses = [
            self.client.post(
                "/api/auth/login",
                {"email": "nobody@example.com", "password": "wrong-pass"},
                format="json",
            ).status_code
            for _ in range(11)
        ]
        self.assertEqual(statuses[-1], 429)
        self.assertIn(401, statuses)  # earlier attempts still reach the view


class RefreshLogoutMeViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Shares the A1 `auth` throttle bucket (10/min per IP) above.
        cache.clear()
        self.user = User.objects.create_user(
            username="demo.admin", email="demo.admin@sansaaric.com",
            password="SuperAdmin@123", first_name="Sansaaric",
        )

    def test_refresh_issues_new_access_token_and_keeps_refresh(self):
        session = local.issue_session(self.user)
        response = self.client.post(
            "/api/auth/refresh", {"refresh_token": session.refresh_token}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()["session"]
        self.assertEqual(body["refresh_token"], session.refresh_token)
        claims = local.decode_access(body["access_token"])
        self.assertEqual(claims["sub"], str(self.user.pk))

    def test_refresh_rejects_an_access_token(self):
        session = local.issue_session(self.user)
        response = self.client.post(
            "/api/auth/refresh", {"refresh_token": session.access_token}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "invalid_token")

    def test_refresh_rejects_garbage(self):
        response = self.client.post(
            "/api/auth/refresh", {"refresh_token": "garbage"}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_logout_requires_authentication(self):
        response = self.client.post("/api/auth/logout", {}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_logout_returns_204(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/auth/logout", {"refresh_token": "whatever"}, format="json"
        )
        self.assertEqual(response.status_code, 204)

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_staff_role(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "admin")
        self.assertTrue(response.json()["is_staff"])

    def test_me_returns_profile_role_when_not_staff(self):
        Profile.objects.create(
            user=self.user, supabase_uid=str(uuid.uuid4()), role="hotel_owner"
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.json()["role"], "hotel_owner")


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
