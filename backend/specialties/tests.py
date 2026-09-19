"""Specialty tests — CRUD and filtering."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from specialties.models import Specialty

User = get_user_model()
PASSWORD = "StrongPass123!"


def _user(email: str, role: str, **extra):
    return User.objects.create_user(
        email=email, password=PASSWORD, role=role, is_verified=True, **extra
    )


def _auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class SpecialtyTests(TestCase):
    def setUp(self):
        self.patient = _user("patient@example.com", "patient")
        self.admin = _user("admin@example.com", "admin")
        self.spec, _ = Specialty.objects.get_or_create(name="Cardiology")

    def test_list_specialties(self):
        Specialty.objects.get_or_create(name="Dermatology")
        client = _auth(self.patient)
        resp = client.get("/api/specialties/")
        self.assertEqual(resp.status_code, 200)

    def test_create_specialty_requires_admin(self):
        client = _auth(self.patient)
        resp = client.post("/api/specialties/", {"name": "Neurology"}, format="json")
        self.assertIn(resp.status_code, [403, 405])

    def test_specialty_detail(self):
        client = _auth(self.patient)
        resp = client.get(f"/api/specialties/{self.spec.pk}/")
        self.assertEqual(resp.status_code, 200)

    def test_unauthenticated_can_list(self):
        resp = APIClient().get("/api/specialties/")
        self.assertEqual(resp.status_code, 200)
