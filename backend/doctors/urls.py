"""Doctor routes (§27)."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from doctors.views import (
    AdminDoctorApprovalView,
    AvailabilityBreakDetailView,
    AvailabilityBreakListView,
    DoctorAvailabilityView,
    DoctorAvailableDaysView,
    DoctorScheduleDetailView,
    DoctorScheduleView,
    EarningsDashboardView,
    MyDoctorProfileView,
    ScheduleExceptionDetailView,
    ScheduleExceptionListView,
    DoctorViewSet,
)

app_name = "doctors"

router = DefaultRouter()
router.register("doctors", DoctorViewSet, basename="doctor")

urlpatterns = [
    path("doctors/me/profile/", MyDoctorProfileView.as_view(), name="my-doctor-profile"),
    path("doctors/me/earnings/", EarningsDashboardView.as_view(), name="doctor-earnings"),
    path(
        "doctors/<int:pk>/availability/",
        DoctorAvailabilityView.as_view(),
        name="doctor-availability",
    ),
    path(
        "doctors/<int:pk>/available-days/",
        DoctorAvailableDaysView.as_view(),
        name="doctor-available-days",
    ),
    path(
        "doctors/me/schedule/",
        DoctorScheduleView.as_view(),
        name="doctor-schedule",
    ),
    path(
        "doctors/me/schedule/<int:pk>/",
        DoctorScheduleDetailView.as_view(),
        name="doctor-schedule-detail",
    ),
    path(
        "doctors/me/schedule/<int:pk>/breaks/",
        AvailabilityBreakListView.as_view(),
        name="availability-break-list",
    ),
    path(
        "doctors/me/schedule/breaks/<int:pk>/",
        AvailabilityBreakDetailView.as_view(),
        name="availability-break-detail",
    ),
    path(
        "doctors/me/schedule/exceptions/",
        ScheduleExceptionListView.as_view(),
        name="schedule-exception-list",
    ),
    path(
        "doctors/me/schedule/exceptions/<int:pk>/",
        ScheduleExceptionDetailView.as_view(),
        name="schedule-exception-detail",
    ),
    path(
        "admin/doctors/<int:pk>/approve/",
        AdminDoctorApprovalView.as_view(),
        name="admin-doctor-approve",
    ),
] + router.urls
