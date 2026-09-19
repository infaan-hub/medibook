"""Appointment booking API (§24 appointments, §27)."""

from django.db import IntegrityError, transaction
from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsDoctor, IsPatient
from appointments.models import Appointment, AppointmentStatus
from appointments.serializers import (
    AppointmentSerializer,
    AppointmentStatusSerializer,
)
from common.pagination import StandardResultsSetPagination
from common.responses import error_response, success_response
from doctors.models import Doctor
from notifications.helpers import notify
from notifications.models import NotificationType


class AppointmentViewSet(ModelViewSet):
    """Patient booking: list own, create, cancel; history via filters."""

    serializer_class = AppointmentSerializer
    pagination_class = StandardResultsSetPagination
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), IsPatient()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        queryset = Appointment.objects.select_related(
            "doctor__user", "hospital", "patient"
        )
        if getattr(user, "role", None) == "doctor":
            try:
                queryset = queryset.filter(doctor=user.doctor)
            except Doctor.DoesNotExist:
                return queryset.none()
        elif getattr(user, "role", None) == "admin" or user.is_superuser:
            pass
        else:
            queryset = queryset.filter(patient=user)
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset.order_by("-appointment_date", "-start_time")

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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        doctor_id = request.data.get("doctor")
        try:
            doctor = Doctor.objects.select_related("user").get(pk=doctor_id)
        except (Doctor.DoesNotExist, TypeError, ValueError):
            return error_response(
                message="The selected doctor was not found.",
                errors={"doctor": ["The selected doctor was not found."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        try:
            with transaction.atomic():
                appointment = Appointment(
                    patient=request.user,
                    doctor=doctor,
                    hospital=serializer.validated_data.get("hospital"),
                    appointment_date=serializer.validated_data["appointment_date"],
                    start_time=serializer.validated_data["start_time"],
                    end_time=serializer.validated_data["end_time"],
                    reason=serializer.validated_data.get("reason", ""),
                )
                appointment.full_clean(
                    exclude=("patient", "doctor", "status")
                )
                appointment.save()
        except IntegrityError:
            return error_response(
                message="This appointment slot is no longer available. Please select another time.",
                errors={"start_time": ["This slot was just booked."]},
                status_code=http_status.HTTP_409_CONFLICT,
            )
        except Exception as exc:
            from django.core.exceptions import ValidationError as DjangoValidationError

            if isinstance(exc, DjangoValidationError):
                return error_response(
                    message="The request could not be processed.",
                    errors=exc.message_dict,
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                )
            raise
        notify(
            doctor.user,
            NotificationType.APPOINTMENT_REQUEST,
            f"New appointment request from {request.user.email}.",
            appointment=appointment,
        )
        return success_response(
            data=AppointmentSerializer(appointment).data,
            message="Appointment requested.",
            status_code=http_status.HTTP_201_CREATED,
        )


class AppointmentActionView(APIView):
    """POST /api/appointments/{id}/{confirm,complete,cancel,reject}/ (§27)."""

    permission_classes = (IsAuthenticated,)

    _ALLOWED = {
        "confirm": ("confirmed", ("doctor", "admin")),
        "complete": ("completed", ("doctor", "admin")),
        "cancel": ("cancelled", ("patient", "doctor", "admin")),
        "reject": ("rejected", ("doctor", "admin")),
    }

    _NOTIFY = {
        "confirmed": NotificationType.APPOINTMENT_CONFIRMED,
        "completed": NotificationType.SYSTEM,
        "cancelled": NotificationType.APPOINTMENT_CANCELLED,
        "rejected": NotificationType.APPOINTMENT_REJECTED,
    }

    def post(self, request, pk: int, action: str):
        if action not in self._ALLOWED:
            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        target_status, roles = self._ALLOWED[action]
        user = request.user
        try:
            appointment = Appointment.objects.select_related(
                "doctor__user", "patient"
            ).get(pk=pk)
        except Appointment.DoesNotExist:
            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        role = getattr(user, "role", None)
        is_admin = role == "admin" or user.is_superuser
        is_owner_doctor = (
            role == "doctor"
            and getattr(user, "doctor", None) is not None
            and appointment.doctor_id == user.doctor.pk
        )
        is_owner_patient = appointment.patient_id == user.pk
        if action == "cancel":
            allowed = is_owner_patient or is_owner_doctor or is_admin
        else:
            allowed = (
                (role in roles and (is_owner_doctor or is_admin))
                or (is_admin and "admin" in roles)
            )
        if not allowed:
            return error_response(
                message="You do not have permission to perform this action.",
                status_code=http_status.HTTP_403_FORBIDDEN,
            )
        serializer = AppointmentStatusSerializer(
            data={"status": target_status, **request.data}
        )
        serializer.is_valid(raise_exception=True)
        appointment.status = target_status
        if serializer.validated_data.get("cancel_reason"):
            appointment.cancel_reason = serializer.validated_data["cancel_reason"]
        if serializer.validated_data.get("notes"):
            appointment.notes = serializer.validated_data["notes"]
        appointment.save(update_fields=["status", "cancel_reason", "notes", "updated_at"])
        other = (
            appointment.patient
            if (is_owner_doctor or (is_admin and not is_owner_patient))
            else appointment.doctor.user
        )
        notify(
            other,
            self._NOTIFY[target_status],
            f"Appointment {target_status}: {appointment.appointment_date} {appointment.start_time}.",
            appointment=appointment,
        )
        return success_response(
            data=AppointmentSerializer(appointment).data,
            message=f"Appointment {target_status}.",
        )


class DoctorAppointmentListView(APIView):
    """GET /api/doctor/appointments/ — own schedule (doctor role)."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def get(self, request):
        try:
            doctor = request.user.doctor
        except Doctor.DoesNotExist:
            return error_response(
                message="Create your doctor profile first.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        queryset = Appointment.objects.filter(doctor=doctor).order_by(
            "-appointment_date", "-start_time"
        )
        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return success_response(
            data=AppointmentSerializer(queryset, many=True).data
        )

