"""Auth test suite — PHASE 3 gate (§52, §45)."""

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import PasswordResetToken

User = get_user_model()


def _register(client: APIClient, **overrides) -> dict:
    payload = {
        "username": "aminakhan",
        "email": "patient@example.com",
        "password": "StrongPass123!",
        "password_confirm": "StrongPass123!",
        "first_name": "Amina",
        "last_name": "Khan",
    }
    payload.update(overrides)
    response = client.post("/api/auth/register/", payload, format="json")
    assert response.status_code == 201, response.data
    return response.data["data"]


class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_login_me_logout_refresh_cycle(self):
        data = _register(self.client)
        self.assertIn("access", data)
        self.assertIn("refresh", data)
        self.assertEqual(len(mail.outbox), 1)

        login = self.client.post(
            "/api/auth/login/",
            {"username": "aminakhan", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        access = login.data["data"]["access"]
        refresh = login.data["data"]["refresh"]

        me = self.client.get(
            "/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["data"]["email"], "patient@example.com")

        refreshed = self.client.post(
            "/api/auth/token/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(refreshed.status_code, 200)
        # Rotation replaced the refresh token; the old one is blacklisted.
        refresh = refreshed.data["data"]["refresh"]

        logout = self.client.post(
            "/api/auth/logout/",
            {"refresh": refresh},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(logout.status_code, 200)
        # Blacklisted refresh token must be rejected afterwards.
        retry = self.client.post(
            "/api/auth/token/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(retry.status_code, 401)

    def test_register_rejects_admin_role_and_mismatch(self):
        bad_role = self.client.post(
            "/api/auth/register/",
            {
                "email": "root@example.com",
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
                "role": "admin",
            },
            format="json",
        )
        self.assertEqual(bad_role.status_code, 400)

        mismatch = self.client.post(
            "/api/auth/register/",
            {
                "email": "other@example.com",
                "password": "StrongPass123!",
                "password_confirm": "Different123!",
            },
            format="json",
        )
        self.assertEqual(mismatch.status_code, 400)

    def test_password_reset_flow(self):
        data = _register(self.client)
        requested = self.client.post(
            "/api/auth/password-reset/",
            {"email": "patient@example.com"},
            format="json",
        )
        self.assertEqual(requested.status_code, 200)
        token = PasswordResetToken.objects.filter(used_at__isnull=True).latest(
            "created_at"
        )
        confirmed = self.client.post(
            "/api/auth/password-reset-confirm/",
            {
                "token": token.token,
                "new_password": "NewStrong123!",
                "new_password_confirm": "NewStrong123!",
            },
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200)
        login = self.client.post(
            "/api/auth/login/",
            {"username": "aminakhan", "password": "NewStrong123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertNotEqual(data["refresh"], login.data["data"]["refresh"])

    def test_password_reset_unknown_email_stays_neutral(self):
        response = self.client.post(
            "/api/auth/password-reset/",
            {"email": "nobody@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_me_requires_auth_and_envelope(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)
        self.assertFalse(response.data["success"])

