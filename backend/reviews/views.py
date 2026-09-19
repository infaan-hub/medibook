"""Review API (§24 reviews, §27, §33)."""

from django.db.models import Avg, Count
from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsPatient
from common.pagination import StandardResultsSetPagination
from common.responses import success_response
from doctors.models import Doctor
from notifications.helpers import notify
from notifications.models import NotificationType
from reviews.models import Review
from reviews.serializers import ReviewSerializer


class AppointmentReviewView(APIView):
    """POST /api/appointments/{id}/review/ — review a completed visit."""

    permission_classes = (IsAuthenticated, IsPatient)

    def post(self, request, pk: int):
        from appointments.models import Appointment

        try:
            appointment = Appointment.objects.get(pk=pk)
        except Appointment.DoesNotExist:
            from common.responses import error_response

            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        serializer = ReviewSerializer(
            data={**request.data, "appointment": appointment.pk},
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        review = serializer.save(
            patient=request.user, doctor=appointment.doctor
        )
        doctor = appointment.doctor
        agg = doctor.reviews.filter(is_visible=True).aggregate(
            avg=Avg("rating"), total=Count("id")
        )
        doctor.average_rating = agg["avg"] or 0
        doctor.total_reviews = agg["total"] or 0
        doctor.save(update_fields=["average_rating", "total_reviews", "updated_at"])
        notify(
            doctor.user,
            NotificationType.REVIEW,
            f"New {review.rating}-star review received.",
            appointment=appointment,
        )
        return success_response(
            data=ReviewSerializer(review).data,
            message="Review submitted.",
            status_code=http_status.HTTP_201_CREATED,
        )


class DoctorReviewListView(APIView):
    """GET /api/doctors/{id}/reviews/ — public visible reviews."""

    permission_classes = (AllowAny,)

    def get(self, request, pk: int):
        try:
            doctor = Doctor.objects.get(pk=pk)
        except Doctor.DoesNotExist:
            from common.responses import error_response

            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        reviews = doctor.reviews.filter(is_visible=True).order_by("-created_at")
        return success_response(
            data=ReviewSerializer(reviews, many=True).data
        )


class ReviewViewSet(ModelViewSet):
    """Own reviews: list/retrieve/delete (edit via delete + re-post)."""

    serializer_class = ReviewSerializer
    pagination_class = StandardResultsSetPagination
    http_method_names = ("get", "delete", "head", "options")

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, "role", None) == "admin" or user.is_superuser:
            return Review.objects.all().order_by("-created_at")
        return Review.objects.filter(patient=user).order_by("-created_at")

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page or queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return success_response(data=serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_response(
            data=self.get_serializer(self.get_object()).data
        )

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)

