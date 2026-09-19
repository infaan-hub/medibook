"""Review tests — CRUD, rating validation, doctor average recalculation."""

from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from appointments.models import Appointment
from doctors.models import Availability, Doctor
from reviews.models import Review

User = get_user_model()
PASSWORD = "StrongPass123!"


def _user(email: str, role: str, **extra):
    return User.objects.create_user(
        username=email.split("@")[0], email=email, password=PASSWORD, role=role, is_verified=True, **extra
    )


def _auth(email: str) -> APIClient:
    client = APIClient()
    username = email.split("@")[0]
    resp = client.post(
        "/api/auth/login/", {"username": username, "password": PASSWORD}, format="json"
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['data']['access']}")
    return client


class ReviewCRUDTests(TestCase):
    def setUp(self):
        self.patient = _user("patient1@example.com", "patient")
        self.doctor_user = _user("doctor1@example.com", "doctor", first_name="Doc", last_name="Tor")
        self.doctor = Doctor.objects.create(user=self.doctor_user)
        self.other_patient = _user("patient2@example.com", "patient")
        # Create a completed appointment.
        self.appt = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            appointment_date=date(2026, 9, 23),
            start_time=time(9, 0),
            end_time=time(9, 30),
            status="completed",
        )

    def test_submit_review_for_completed_appointment(self):
        client = _auth("patient1@example.com")
        resp = client.post(
            f"/api/appointments/{self.appt.pk}/review/",
            {"rating": 4, "comment": "Good doctor"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["data"]["rating"], 4)
        self.doctor.refresh_from_db()
        self.assertEqual(float(self.doctor.average_rating), 4.0)
        self.assertEqual(self.doctor.total_reviews, 1)

    def test_cannot_review_pending_appointment(self):
        pending = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            appointment_date=date(2026, 9, 24),
            start_time=time(10, 0),
            end_time=time(10, 30),
            status="pending",
        )
        client = _auth("patient1@example.com")
        resp = client.post(
            f"/api/appointments/{pending.pk}/review/",
            {"rating": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_cannot_review_other_patients_appointment(self):
        client = _auth("patient2@example.com")
        resp = client.post(
            f"/api/appointments/{self.appt.pk}/review/",
            {"rating": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_cannot_review_twice(self):
        client = _auth("patient1@example.com")
        client.post(
            f"/api/appointments/{self.appt.pk}/review/",
            {"rating": 5},
            format="json",
        )
        resp = client.post(
            f"/api/appointments/{self.appt.pk}/review/",
            {"rating": 4},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_rating_out_of_range_rejected(self):
        client = _auth("patient1@example.com")
        resp = client.post(
            f"/api/appointments/{self.appt.pk}/review/",
            {"rating": 6},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        resp = client.post(
            f"/api/appointments/{self.appt.pk}/review/",
            {"rating": 0},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_doctor_review_list(self):
        Review.objects.create(
            appointment=self.appt,
            patient=self.patient,
            doctor=self.doctor,
            rating=5,
            comment="Excellent",
        )
        resp = APIClient().get(f"/api/doctors/{self.doctor.pk}/reviews/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["data"]), 1)

    def test_delete_own_review(self):
        review = Review.objects.create(
            appointment=self.appt,
            patient=self.patient,
            doctor=self.doctor,
            rating=5,
        )
        client = _auth("patient1@example.com")
        resp = client.delete(f"/api/reviews/{review.pk}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Review.objects.filter(pk=review.pk).exists())
