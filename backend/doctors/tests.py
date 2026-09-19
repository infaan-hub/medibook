from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from doctors.models import Doctor


class DoctorProfileTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="doctor-profile@example.com", password="StrongPass123!", role="doctor"
        )
        login = APIClient().post("/api/auth/login/", {"email": self.user.email, "password": "StrongPass123!"}, format="json")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def test_doctor_can_read_and_update_own_profile(self):
        response = self.client.get("/api/doctors/me/profile/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Doctor.objects.filter(user=self.user).exists())
        response = self.client.patch("/api/doctors/me/profile/", {"bio": "Family physician", "experience_years": 8}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["bio"], "Family physician")

    def test_patient_cannot_access_doctor_profile_endpoint(self):
        patient = get_user_model().objects.create_user(email="patient-profile@example.com", password="StrongPass123!", role="patient")
        login = APIClient().post("/api/auth/login/", {"email": patient.email, "password": "StrongPass123!"}, format="json")
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")
        self.assertEqual(client.get("/api/doctors/me/profile/").status_code, 403)
