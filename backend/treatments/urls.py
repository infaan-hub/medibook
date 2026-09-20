"""Treatment routes."""

from django.urls import path

from treatments.views import (
    TreatmentListCreateView,
    TreatmentDetailView,
    DoctorPatientListView,
)

app_name = "treatments"

urlpatterns = [
    path("treatments/", TreatmentListCreateView.as_view(), name="treatment-list"),
    path("treatments/<int:pk>/", TreatmentDetailView.as_view(), name="treatment-detail"),
    path("treatments/patients/", DoctorPatientListView.as_view(), name="doctor-patients"),
]
