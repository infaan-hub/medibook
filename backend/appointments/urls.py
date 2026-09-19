"""Appointment routes (§27)."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from appointments.views import (
    AppointmentActionView,
    AppointmentViewSet,
    DoctorAppointmentListView,
)

app_name = "appointments"

router = DefaultRouter()
router.register("appointments", AppointmentViewSet, basename="appointment")

urlpatterns = [
    path(
        "appointments/<int:pk>/<str:action>/",
        AppointmentActionView.as_view(),
        name="appointment-action",
    ),
    path(
        "doctor/appointments/",
        DoctorAppointmentListView.as_view(),
        name="doctor-appointments",
    ),
] + router.urls
