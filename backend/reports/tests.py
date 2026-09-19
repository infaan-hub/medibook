"""Admin reports tests — stats endpoint, user directory."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from appointments.models import Appointment
from doctors.models import Doctor
from hospitals.models import Hospital
from specialties.models import Specialty
from datetime import date, time

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


class AdminStatsTests(TestCase):
    def setUp(self):
        self.admin = _user("admin@example.com", "admin")
        self.patient = _user("patient@example.com", "patient")
        self.doctor_user = _user("doc@example.com", "doctor")
        self.doctor = Doctor.objects.create(user=self.doctor_user)
        self.hospital = Hospital.objects.create(name="City Care", city="Lahore")

    def test_admin_stats_returns_correct_counts(self):
        Appointment.objects.create(
            patient=self.patient, doctor=self.doctor,
            appointment_date=date(2026, 9, 23),
            start_time=time(9, 0), end_time=time(9, 30), status="pending",
        )
        Appointment.objects.create(
            patient=self.patient, doctor=self.doctor,
            appointment_date=date(2026, 9, 24),
            start_time=time(10, 0), end_time=time(10, 30), status="completed",
        )
        client = _auth(self.admin)
        resp = client.get("/api/admin/stats/")
        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertEqual(data["users"], 3)  # admin + patient + doctor
        self.assertEqual(data["patients"], 1)
        self.assertEqual(data["doctors"], 1)
        self.assertEqual(data["appointments"], 2)
        self.assertEqual(data["appointments_by_status"]["pending"], 1)
        self.assertEqual(data["appointments_by_status"]["completed"], 1)

    def test_non_admin_cannot_access_stats(self):
        client = _auth(self.patient)
        resp = client.get("/api/admin/stats/")
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated_cannot_access_stats(self):
        resp = APIClient().get("/api/admin/stats/")
        self.assertEqual(resp.status_code, 401)


class AdminUserListTests(TestCase):
    def setUp(self):
        self.admin = _user("admin@example.com", "admin")
        self.patient = _user("patient@example.com", "patient")
        self.doctor_user = _user("doc@example.com", "doctor")

    def test_admin_can_list_users(self):
        client = _auth(self.admin)
        resp = client.get("/api/admin/users/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["data"]["count"], 3)

    def test_filter_by_role(self):
        client = _auth(self.admin)
        resp = client.get("/api/admin/users/?role=doctor")
        self.assertEqual(resp.data["data"]["count"], 1)

    def test_non_admin_cannot_list_users(self):
        client = _auth(self.patient)
        resp = client.get("/api/admin/users/")
        self.assertEqual(resp.status_code, 403)
