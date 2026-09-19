"""Patient profile tests — read/update, role-based access."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from patients.models import Patient

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


class PatientProfileTests(TestCase):
    def setUp(self):
        self.patient = _user("patient@example.com", "patient")
        self.doctor = _user("doctor@example.com", "doctor")

    def test_patient_can_read_profile(self):
        client = _auth(self.patient)
        resp = client.get("/api/patients/profile/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(Patient.objects.filter(user=self.patient).exists())

    def test_patient_can_update_profile_fields(self):
        client = _auth(self.patient)
        resp = client.patch(
            "/api/patients/profile/", {"city": "Lahore", "blood_group": "O+"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        profile = Patient.objects.get(user=self.patient)
        self.assertEqual(profile.city, "Lahore")
        self.assertEqual(profile.blood_group, "O+")

    def test_unauthenticated_cannot_access_profile(self):
        resp = APIClient().get("/api/patients/profile/")
        self.assertEqual(resp.status_code, 401)
