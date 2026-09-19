"""Doctor discovery + schedule management (§24 doctors, §27)."""

from datetime import date, datetime, timedelta

from django.db.models import Avg, Q
from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsAdminRole, IsDoctor
from appointments.models import Appointment
from common.pagination import StandardResultsSetPagination
from common.responses import error_response, success_response
from doctors.models import Availability, Doctor
from doctors.serializers import (
    AvailabilitySerializer,
    DoctorSerializer,
    DoctorWriteSerializer,
)


class DoctorViewSet(ModelViewSet):
    """Public list/retrieve with search + filters; owner/admin write."""

    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = Doctor.objects.select_related("user").prefetch_related(
            "specialties", "hospitals"
        ).filter(is_available=True)
        params = self.request.query_params
        search = params.get("search")
        if search:
            queryset = queryset.filter(
                Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
            )
        specialty = params.get("specialty")
        if specialty:
            queryset = queryset.filter(specialties__id=specialty)
        city = params.get("city")
        if city:
            queryset = queryset.filter(hospitals__city__icontains=city)
        hospital = params.get("hospital")
        if hospital:
            queryset = queryset.filter(hospitals__id=hospital)
        min_rating = params.get("min_rating")
        if min_rating:
            try:
                queryset = queryset.filter(average_rating__gte=float(min_rating))
            except ValueError:
                pass
        return queryset.distinct()

    def get_serializer_class(self):
        if self.action in ("list", "retrieve"):
            return DoctorSerializer
        return DoctorWriteSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def _check_owner(self, request, doctor: Doctor) -> bool:
        user = request.user
        return bool(
            user.is_superuser
            or getattr(user, "role", None) == "admin"
            or doctor.user_id == user.pk
        )

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = DoctorSerializer(page or queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return success_response(data=serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_response(
            data=DoctorSerializer(self.get_object()).data
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        doctor = self.get_object()
        if not self._check_owner(request, doctor):
            return error_response(
                message="You do not have permission to perform this action.",
                status_code=http_status.HTTP_403_FORBIDDEN,
            )
        serializer = DoctorWriteSerializer(
            doctor, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=DoctorSerializer(serializer.instance).data,
            message="Doctor profile updated.",
        )

    def destroy(self, request, *args, **kwargs):
        doctor = self.get_object()
        if not self._check_owner(request, doctor):
            return error_response(
                message="You do not have permission to perform this action.",
                status_code=http_status.HTTP_403_FORBIDDEN,
            )
        doctor.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)




class DoctorAvailabilityView(APIView):
    """GET /api/doctors/{id}/availability/?date=YYYY-MM-DD (§27)."""

    permission_classes = (AllowAny,)

    def get(self, request, pk: int):
        try:
            doctor = Doctor.objects.get(pk=pk)
        except Doctor.DoesNotExist:
            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        raw = request.query_params.get("date")
        try:
            target = (
                datetime.strptime(raw, "%Y-%m-%d").date() if raw else date.today()
            )
        except ValueError:
            return error_response(
                message="Use date=YYYY-MM-DD.",
                errors={"date": ["Use date=YYYY-MM-DD."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        weekday = target.weekday()
        windows = Availability.objects.filter(
            doctor=doctor, weekday=weekday, is_active=True
        ).order_by("start_time")
        booked = set(
            Appointment.objects.filter(
                doctor=doctor, appointment_date=target
            ).exclude(status__in=("cancelled", "rejected")).values_list(
                "start_time", flat=True
            )
        )
        slots: list[dict] = []
        for window in windows:
            cursor = datetime.combine(target, window.start_time)
            end = datetime.combine(target, window.end_time)
            step = timedelta(minutes=window.slot_duration_minutes or 30)
            while cursor + step <= end + timedelta(seconds=1):
                label = cursor.time()
                if label not in booked:
                    slots.append(
                        {
                            "start_time": label.strftime("%H:%M"),
                            "end_time": (cursor + step).time().strftime("%H:%M"),
                        }
                    )
                cursor += step
        return success_response(
            data={"doctor": doctor.pk, "date": target.isoformat(), "slots": slots}
        )


class DoctorScheduleView(APIView):
    """GET/POST /api/doctors/me/schedule/ — owner availability windows."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _get_doctor(self, request):
        try:
            return request.user.doctor
        except Doctor.DoesNotExist:
            return None

    def get(self, request):
        doctor = self._get_doctor(request)
        if doctor is None:
            return error_response(
                message="Create your doctor profile first.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        windows = Availability.objects.filter(doctor=doctor).order_by(
            "weekday", "start_time"
        )
        return success_response(
            data=AvailabilitySerializer(windows, many=True).data
        )

    def post(self, request):
        doctor = self._get_doctor(request)
        if doctor is None:
            return error_response(
                message="Create your doctor profile first.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        serializer = AvailabilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(doctor=doctor)
        return success_response(
            data=serializer.data,
            message="Availability added.",
            status_code=http_status.HTTP_201_CREATED,
        )


class MyDoctorProfileView(APIView):
    """GET/PATCH /api/doctors/me/profile/ for the authenticated doctor."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _doctor(self, request):
        return Doctor.objects.get_or_create(user=request.user)[0]

    def get(self, request):
        return success_response(data=DoctorSerializer(self._doctor(request)).data)

    def patch(self, request):
        serializer = DoctorWriteSerializer(
            self._doctor(request), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=DoctorSerializer(serializer.instance).data,
            message="Doctor profile updated.",
        )


class DoctorScheduleDetailView(APIView):
    """PATCH/DELETE /api/doctors/me/schedule/{id}/ — owner window edit."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _get_window(self, request, pk: int):
        try:
            return Availability.objects.get(pk=pk, doctor=request.user.doctor)
        except (Availability.DoesNotExist, Doctor.DoesNotExist):
            return None

    def patch(self, request, pk: int):
        window = self._get_window(request, pk)
        if window is None:
            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        serializer = AvailabilitySerializer(window, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message="Availability updated.")

    def delete(self, request, pk: int):
        window = self._get_window(request, pk)
        if window is None:
            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        window.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class AdminDoctorApprovalView(APIView):
    """POST /api/admin/doctors/{id}/approve/ — toggle availability (§27)."""

    permission_classes = (IsAuthenticated, IsAdminRole)

    def post(self, request, pk: int):
        try:
            doctor = Doctor.objects.get(pk=pk)
        except Doctor.DoesNotExist:
            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        doctor.is_available = bool(request.data.get("is_available", True))
        doctor.save(update_fields=["is_available", "updated_at"])
        agg = doctor.reviews.filter(is_visible=True).aggregate(avg=Avg("rating"))
        if agg["avg"] is not None:
            doctor.average_rating = agg["avg"]
            doctor.save(update_fields=["average_rating", "updated_at"])
        return success_response(
            data=DoctorSerializer(doctor).data, message="Doctor updated."
        )
