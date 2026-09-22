"""Treatment routes."""

from django.urls import path

from treatments.views import (
    TreatmentListCreateView,
    TreatmentDetailView,
    DoctorPatientListView,
    PatientVisitHistoryView,
)
from treatments.views_health_records import (
    HealthRecordListCreateView,
    HealthRecordDetailView,
)

app_name = "treatments"

urlpatterns = [
    path("treatments/", TreatmentListCreateView.as_view(), name="treatment-list"),
    path("treatments/<int:pk>/", TreatmentDetailView.as_view(), name="treatment-detail"),
    path("treatments/patients/", DoctorPatientListView.as_view(), name="doctor-patients"),
    path("treatments/visit-history/", PatientVisitHistoryView.as_view(), name="patient-visit-history"),
    path("health-records/", HealthRecordListCreateView.as_view(), name="health-record-list"),
    path("health-records/<int:pk>/", HealthRecordDetailView.as_view(), name="health-record-detail"),
]
