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


class DoctorLocationTests(TestCase):
    """Location fields on the doctor card + nearby-aware directory filters."""

    def setUp(self):
        self.dar_user = User.objects.create_user(
            username="doc-dar", email="doc-dar@example.com", password="StrongPass123!",
            role="doctor", first_name="Amina", last_name="Juma",
        )
        self.dar = Doctor.objects.create(
            user=self.dar_user, city="Dar es Salaam", office_address="Plot 12, Mikocheni Street"
        )
        self.mwanza_user = User.objects.create_user(
            username="doc-mwanza", email="doc-mwanza@example.com", password="StrongPass123!",
            role="doctor", first_name="Peter", last_name="Mushi",
        )
        self.mwanza = Doctor.objects.create(
            user=self.mwanza_user, city="Mwanza", office_address="Kenyatta Rd Clinic"
        )

    def test_location_fields_in_public_serializer(self):
        data = APIClient().get(f"/api/doctors/{self.dar.pk}/").data["data"]
        self.assertEqual(data["city"], "Dar es Salaam")
        self.assertEqual(data["office_address"], "Plot 12, Mikocheni Street")

    def test_location_filter_matches_doctor_city(self):
        results = APIClient().get("/api/doctors/?city=dar").data["data"]["results"]
        self.assertEqual([d["id"] for d in results], [self.dar.id])

    def test_search_matches_office_address(self):
        results = APIClient().get("/api/doctors/?search=mikocheni").data["data"]["results"]
        self.assertEqual([d["id"] for d in results], [self.dar.id])

    def test_doctor_can_update_own_location(self):
        client = APIClient()
        client.force_authenticate(user=self.dar_user)
        resp = client.patch(
            "/api/doctors/me/profile/",
            {"city": "Arusha", "office_address": "Sokoine Road 4"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.dar.refresh_from_db()
        self.assertEqual(self.dar.city, "Arusha")
        self.assertEqual(self.dar.office_address, "Sokoine Road 4")
