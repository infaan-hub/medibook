"""Patient routes (§27)."""

from django.urls import path

from patients.views import PatientProfileView

app_name = "patients"

urlpatterns = [
    path("patients/profile/", PatientProfileView.as_view(), name="profile"),
]
