"""Hospital tests — CRUD and city filtering."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from hospitals.models import Hospital

User = get_user_model()
PASSWORD = "StrongPass123!"


def _user(email: str, role: str, **extra):
    return User.objects.create_user(
        username=email.split("@")[0], email=email, password=PASSWORD, role=role, is_verified=True, **extra
    )


def _auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class HospitalTests(TestCase):
    def setUp(self):
        self.patient = _user("patient@example.com", "patient")
        self.hospital = Hospital.objects.create(
            name="City Care", city="Lahore", address="123 Main St"
        )

    def test_list_hospitals(self):
        client = _auth(self.patient)
        resp = client.get("/api/hospitals/")
        self.assertEqual(resp.status_code, 200)

    def test_hospital_detail(self):
        client = _auth(self.patient)
        resp = client.get(f"/api/hospitals/{self.hospital.pk}/")
        self.assertEqual(resp.status_code, 200)

    def test_filter_by_city(self):
        Hospital.objects.create(name="Metro Hospital", city="Karachi")
        client = _auth(self.patient)
        resp = client.get("/api/hospitals/?city=Lahore")
        self.assertEqual(resp.status_code, 200)

    def test_unauthenticated_can_list(self):
        resp = APIClient().get("/api/hospitals/")
        self.assertEqual(resp.status_code, 200)
