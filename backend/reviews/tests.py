"""Review tests — CRUD, rating validation, doctor average recalculation."""

from datetime import date, time

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count
from django.test import TestCase
from rest_framework.test import APIClient

from appointments.models import Appointment
from doctors.models import Availability, Doctor
from reviews.models import Review

User = get_user_model()
PASSWORD = "StrongPass123!"


def _user(email: str, role: str, **extra):
    username = email.split("@")[0]
    if role == "admin":
        # The admin screens are guarded by is_superuser, so admin fixtures must
        # be real superusers (mirrors reports/tests.py).
        return User.objects.create_superuser(
            username=username, email=email, password=PASSWORD, **extra
        )
    return User.objects.create_user(
        username=username, email=email, password=PASSWORD, role=role, **extra
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


class MyReviewManagementTests(TestCase):
    """
    GET /api/reviews/ powers the patient "My reviews" screen; DELETE removes a
    review and must leave the doctor's cached rating/count consistent.
    """

    def setUp(self):
        self.patient = _user("patient1@example.com", "patient", first_name="Pat", last_name="One")
        self.other_patient = _user("patient2@example.com", "patient")
        self.admin = _user("admin@example.com", "admin")
        self.doctor_user = _user("doctor1@example.com", "doctor", first_name="Doc", last_name="Tor")
        self.doctor = Doctor.objects.create(user=self.doctor_user)
        self.appt_one = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor,
            appointment_date=date(2026, 9, 23),
            start_time=time(9, 0), end_time=time(9, 30), status="completed",
        )
        self.appt_two = Appointment.objects.create(
            patient=self.other_patient, doctor=self.doctor,
            appointment_date=date(2026, 9, 24),
            start_time=time(10, 0), end_time=time(10, 30), status="completed",
        )
        self.review = Review.objects.create(
            appointment=self.appt_one, patient=self.patient, doctor=self.doctor,
            rating=5, comment="Excellent care",
        )
        self.other_review = Review.objects.create(
            appointment=self.appt_two, patient=self.other_patient, doctor=self.doctor,
            rating=3, comment="It was fine",
        )
        self._refresh_doctor()

    def _refresh_doctor(self):
        agg = self.doctor.reviews.filter(is_visible=True).aggregate(
            avg=Avg("rating"), total=Count("id")
        )
        self.doctor.average_rating = agg["avg"] or 0
        self.doctor.total_reviews = agg["total"] or 0
        self.doctor.save(update_fields=["average_rating", "total_reviews", "updated_at"])

    def test_my_reviews_returns_only_the_signed_in_patients_reviews(self):
        client = _auth("patient1@example.com")
        resp = client.get("/api/reviews/")
        self.assertEqual(resp.status_code, 200, resp.data)
        results = resp.data["data"]["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.review.pk)

    def test_my_reviews_payload_carries_the_fields_the_screen_renders(self):
        client = _auth("patient1@example.com")
        row = client.get("/api/reviews/").data["data"]["results"][0]
        # "Dr. <name>", the review date and visibility drive the My reviews rows.
        self.assertEqual(row["doctor_name"], "Dr. Doc Tor")
        self.assertEqual(row["rating"], 5)
        self.assertEqual(row["comment"], "Excellent care")
        self.assertIs(row["is_visible"], True)
        self.assertTrue(row["created_at"])

    def test_patient_cannot_delete_another_patients_review(self):
        client = _auth("patient1@example.com")
        resp = client.delete(f"/api/reviews/{self.other_review.pk}/")
        self.assertEqual(resp.status_code, 404)
        self.assertTrue(Review.objects.filter(pk=self.other_review.pk).exists())

    def test_delete_review_recalculates_the_doctor_rating(self):
        self.assertEqual(float(self.doctor.average_rating), 4.0)
        self.assertEqual(self.doctor.total_reviews, 2)

        client = _auth("patient1@example.com")
        resp = client.delete(f"/api/reviews/{self.review.pk}/")
        self.assertEqual(resp.status_code, 204)

        self.doctor.refresh_from_db()
        # Only the 3-star review remains → average drops from 4.0 to 3.0.
        self.assertEqual(float(self.doctor.average_rating), 3.0)
        self.assertEqual(self.doctor.total_reviews, 1)

    def test_deleting_the_last_review_resets_the_doctor_rating(self):
        Review.objects.filter(pk=self.other_review.pk).delete()
        self._refresh_doctor()
        self.assertEqual(float(self.doctor.average_rating), 5.0)

        client = _auth("patient1@example.com")
        self.assertEqual(client.delete(f"/api/reviews/{self.review.pk}/").status_code, 204)

        self.doctor.refresh_from_db()
        # No reviews left → rating is 0.0 and the card shows "New" again.
        self.assertEqual(float(self.doctor.average_rating), 0.0)
        self.assertEqual(self.doctor.total_reviews, 0)

    def test_admin_oversight_sees_every_review(self):
        client = _auth("admin@example.com")
        resp = client.get("/api/reviews/?page_size=100")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["data"]["count"], 2)
