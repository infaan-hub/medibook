"""Admin/report routes (§27, §34)."""

from django.urls import path

from reports.views import (
    AdminAuditView,
    AdminDoctorCreateView,
    AdminStatsView,
    AdminUserCreateView,
    AdminUserListView,
)

app_name = "reports"

urlpatterns = [
    path("admin/stats/", AdminStatsView.as_view(), name="admin-stats"),
    path("admin/users/", AdminUserListView.as_view(), name="admin-users"),
    path("admin/users/create/", AdminUserCreateView.as_view(), name="admin-user-create"),
    path("admin/doctors/create/", AdminDoctorCreateView.as_view(), name="admin-doctor-create"),
    path("admin/audit/", AdminAuditView.as_view(), name="admin-audit"),
]
