"""Admin dashboard statistics (§24 reports, §34)."""

from django.contrib.auth import get_user_model
from django.db.models import Count
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from appointments.models import Appointment
from common.responses import success_response
from doctors.models import Doctor

User = get_user_model()


class AdminStatsView(APIView):
    """GET /api/admin/stats/ — platform totals + appointment breakdown."""

    permission_classes = (IsAuthenticated, IsAdminRole)

    def get(self, request):
        from django.db.models import Q

        # Single aggregation pass for all user counts.
        user_counts = User.objects.aggregate(
            total=Count("id"),
            patients=Count("id", filter=Q(role="patient")),
        )
        # Single aggregation pass for appointment counts.
        appt_counts = Appointment.objects.aggregate(
            total=Count("id"),
        )
        by_status = {
            row["status"]: row["total"]
            for row in Appointment.objects.values("status").annotate(
                total=Count("id")
            )
        }
        return success_response(
            data={
                "users": user_counts["total"],
                "patients": user_counts["patients"],
                "doctors": Doctor.objects.count(),
                "appointments": appt_counts["total"],
                "appointments_by_status": by_status,
            }
        )


class AdminUserListView(APIView):
    """GET /api/admin/users/ — paginated user directory (admin only)."""

    permission_classes = (IsAuthenticated, IsAdminRole)

    def get(self, request):
        from accounts.serializers import UserSerializer
        from common.pagination import StandardResultsSetPagination

        queryset = User.objects.all().order_by("-created_at")
        role = request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = UserSerializer(page or queryset, many=True)
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return success_response(data=serializer.data)

