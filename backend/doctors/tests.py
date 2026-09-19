from django.contrib.auth import get_user_model
from datetime import time
from django.test import TestCase
from rest_framework.test import APIClient

from doctors.models import Availability, Doctor


User = get_user_model()


class DoctorProfileTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="doctor-profile", email="doctor-profile@example.com", password="StrongPass123!", role="doctor"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_doctor_can_read_and_update_own_profile(self):
        response = self.client.get("/api/doctors/me/profile/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Doctor.objects.filter(user=self.user).exists())
        response = self.client.patch("/api/doctors/me/profile/", {"bio": "Family physician", "experience_years": 8}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["bio"], "Family physician")

    def test_patient_cannot_access_doctor_profile_endpoint(self):
        patient = User.objects.create_user(username="patient-profile", email="patient-profile@example.com", password="StrongPass123!", role="patient")
        client = APIClient()
        client.force_authenticate(user=patient)
        self.assertEqual(client.get("/api/doctors/me/profile/").status_code, 403)

    def test_breaks_and_exceptions_are_removed_from_public_slots(self):
        doctor, _ = Doctor.objects.get_or_create(user=self.user)
        window = Availability.objects.create(
            doctor=doctor, weekday=1, start_time=time(9), end_time=time(11), slot_duration_minutes=30
        )
        created_break = self.client.post(
            f"/api/doctors/me/schedule/{window.pk}/breaks/",
            {"start_time": "09:30", "end_time": "10:00"}, format="json"
        )
        self.assertEqual(created_break.status_code, 201, created_break.data)
        closure = self.client.post(
            "/api/doctors/me/schedule/exceptions/",
            {"date": "2026-09-22", "start_time": "10:00", "end_time": "10:30", "reason": "Training"}, format="json"
        )
        self.assertEqual(closure.status_code, 201, closure.data)
        slots = self.client.get(f"/api/doctors/{doctor.pk}/availability/?date=2026-09-22")
        self.assertEqual(slots.status_code, 200)
        starts = [slot["start_time"] for slot in slots.data["data"]["slots"]]
        self.assertEqual(starts, ["09:00", "10:30"])
        full_day = self.client.post(
            "/api/doctors/me/schedule/exceptions/",
            {"date": "2026-09-22", "reason": "Holiday"}, format="json"
        )
        self.assertEqual(full_day.status_code, 201, full_day.data)
        slots = self.client.get(f"/api/doctors/{doctor.pk}/availability/?date=2026-09-22")
        self.assertEqual(slots.data["data"]["slots"], [])
