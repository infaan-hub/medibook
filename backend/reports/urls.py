"""Admin/report routes (§27, §34)."""

from django.urls import path

from reports.views import AdminStatsView, AdminUserListView

app_name = "reports"

urlpatterns = [
    path("admin/stats/", AdminStatsView.as_view(), name="admin-stats"),
    path("admin/users/", AdminUserListView.as_view(), name="admin-users"),
]
