"""Patient routes (§27)."""

from django.urls import path

from patients.views import PatientProfileView
from treatments.views import PatientDetailView

app_name = "patients"

urlpatterns = [
    path("patients/profile/", PatientProfileView.as_view(), name="profile"),
    path("patients/<int:user_id>/", PatientDetailView.as_view(), name="patient-detail"),
]
