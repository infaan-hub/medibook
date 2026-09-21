"""Admin reports tests — stats endpoint, user directory."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from appointments.models import Appointment
from doctors.models import Doctor
from hospitals.models import Hospital
from reports.models import AuditEvent
from specialties.models import Specialty
from datetime import date, time

User = get_user_model()
PASSWORD = "StrongPass123!"


def _user(email: str, role: str, **extra):
    if role == "admin":
        return User.objects.create_superuser(
            username=email.split("@")[0], email=email, password=PASSWORD, **extra
        )
    return User.objects.create_user(
        username=email.split("@")[0], email=email, password=PASSWORD, role=role, **extra
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

    def test_admin_role_without_superuser_cannot_access_stats(self):
        role_only_admin = _user("role-admin@example.com", "admin")
        role_only_admin.is_superuser = False
        role_only_admin.save(update_fields=["is_superuser"])
        resp = _auth(role_only_admin).get("/api/admin/stats/")
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


class AdminUserDeleteTests(TestCase):
    def setUp(self):
        self.admin = _user("admin@example.com", "admin")
        self.patient = _user("patient@example.com", "patient")
        self.doctor_user = _user("doc@example.com", "doctor")
        self.doctor = Doctor.objects.create(user=self.doctor_user)

    def test_admin_can_delete_patient(self):
        client = _auth(self.admin)
        resp = client.delete(f"/api/admin/users/{self.patient.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(User.objects.filter(pk=self.patient.pk).exists())

    def test_delete_patient_is_audited(self):
        client = _auth(self.admin)
        client.delete(f"/api/admin/users/{self.patient.pk}/")
        self.assertTrue(AuditEvent.objects.filter(action="user.deleted").exists())

    def test_admin_can_delete_doctor_profile_and_account(self):
        client = _auth(self.admin)
        resp = client.delete(f"/api/admin/doctors/{self.doctor.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Doctor.objects.filter(pk=self.doctor.pk).exists())
        self.assertFalse(User.objects.filter(pk=self.doctor_user.pk).exists())

    def test_delete_patient_removes_their_appointments(self):
        Appointment.objects.create(
            patient=self.patient, doctor=self.doctor,
            appointment_date=date(2026, 9, 23),
            start_time=time(9, 0), end_time=time(9, 30), status="pending",
        )
        client = _auth(self.admin)
        client.delete(f"/api/admin/users/{self.patient.pk}/")
        self.assertEqual(Appointment.objects.count(), 0)

    def test_non_admin_cannot_delete_user(self):
        client = _auth(self.patient)
        resp = client.delete(f"/api/admin/users/{self.doctor_user.pk}/")
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.doctor_user.pk).exists())

    def test_admin_cannot_delete_self(self):
        client = _auth(self.admin)
        resp = client.delete(f"/api/admin/users/{self.admin.pk}/")
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_admin_cannot_delete_admin_account(self):
        other_admin = _user("admin2@example.com", "admin")
        client = _auth(self.admin)
        resp = client.delete(f"/api/admin/users/{other_admin.pk}/")
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(User.objects.filter(pk=other_admin.pk).exists())

    def test_delete_unknown_user_returns_404(self):
        client = _auth(self.admin)
        resp = client.delete("/api/admin/users/99999/")
        self.assertEqual(resp.status_code, 404)

    def test_delete_unknown_doctor_returns_404(self):
        client = _auth(self.admin)
        resp = client.delete("/api/admin/doctors/99999/")
        self.assertEqual(resp.status_code, 404)
