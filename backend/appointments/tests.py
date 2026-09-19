"""Booking + review + catalog test suite — backend gates (§45)."""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from doctors.models import Availability, Doctor
from hospitals.models import Hospital
from specialties.models import Specialty

User = get_user_model()
PASSWORD = "StrongPass123!"


def _user(email: str, role: str, **extra):
    user = User.objects.create_user(
        email=email, password=PASSWORD, role=role, is_verified=True, **extra
    )
    return user


def _auth(email: str) -> APIClient:
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"email": email, "password": PASSWORD}, format="json"
    )
    assert response.status_code == 200, response.data
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {response.data['data']['access']}"
    )
    return client


class BookingFlowTests(TestCase):
    def setUp(self):
        self.patient = _user("patient@example.com", "patient")
        self.doctor_user = _user(
            "doctor@example.com",
            "doctor",
            first_name="Doc",
            last_name="Tor",
        )
        self.doctor = Doctor.objects.create(user=self.doctor_user)
        self.specialty, _ = Specialty.objects.get_or_create(name="Cardiology")
        self.doctor.specialties.add(self.specialty)
        self.hospital = Hospital.objects.create(name="City Care", city="Lahore")
        self.doctor.hospitals.add(self.hospital)
        # 2026-09-22 is a Tuesday (weekday=1).
        Availability.objects.create(
            doctor=self.doctor, weekday=1,
            start_time=time(9, 0), end_time=time(11, 0),
            slot_duration_minutes=30,
        )

    def test_booking_double_booking_and_history(self):
        client = _auth("patient@example.com")
        payload = {
            "doctor": self.doctor.pk,
            "hospital": self.hospital.pk,
            "appointment_date": str(date(2026, 9, 22)),
            "start_time": "09:00",
            "end_time": "09:30",
            "reason": "Checkup",
        }
        first = client.post("/api/appointments/", payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        appointment_id = first.data["data"]["id"]

        # Double-booking the same slot → 409 with the §28 envelope.
        second = client.post("/api/appointments/", payload, format="json")
        self.assertEqual(second.status_code, 409)
        self.assertFalse(second.data["success"])

        # History filter by status.
        history = client.get("/api/appointments/?status=pending")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data["data"]["results"]), 1)

        # Doctor confirms; availability no longer lists the slot.
        doctor_client = _auth("doctor@example.com")
        confirm = doctor_client.post(
            f"/api/appointments/{appointment_id}/confirm/", {}, format="json"
        )
        self.assertEqual(confirm.status_code, 200)
        self.assertEqual(confirm.data["data"]["status"], "confirmed")

        slots = client.get(
            f"/api/doctors/{self.doctor.pk}/availability/?date=2026-09-22"
        )
        self.assertEqual(slots.status_code, 200)
        starts = [s["start_time"] for s in slots.data["data"]["slots"]]
        self.assertNotIn("09:00", starts)
        self.assertIn("09:30", starts)

    def test_doctor_search_filters(self):
        client = _auth("patient@example.com")
        response = client.get(
            f"/api/doctors/?specialty={self.specialty.pk}&city=Lahore&search=doc"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]["results"]), 1)

    def test_review_only_after_completed(self):
        client = _auth("patient@example.com")
        payload = {
            "doctor": self.doctor.pk,
            "appointment_date": str(date(2026, 9, 22)),
            "start_time": "10:00",
            "end_time": "10:30",
        }
        created = client.post("/api/appointments/", payload, format="json")
        appointment_id = created.data["data"]["id"]
        early = client.post(
            f"/api/appointments/{appointment_id}/review/",
            {"rating": 5, "comment": "Great"},
            format="json",
        )
        self.assertEqual(early.status_code, 400)

        doctor_client = _auth("doctor@example.com")
        doctor_client.post(
            f"/api/appointments/{appointment_id}/confirm/", {}, format="json"
        )
        doctor_client.post(
            f"/api/appointments/{appointment_id}/complete/", {}, format="json"
        )
        review = client.post(
            f"/api/appointments/{appointment_id}/review/",
            {"rating": 5, "comment": "Great"},
            format="json",
        )
        self.assertEqual(review.status_code, 201)
        self.doctor.refresh_from_db()
        self.assertEqual(float(self.doctor.average_rating), 5.0)
        self.assertEqual(self.doctor.total_reviews, 1)

