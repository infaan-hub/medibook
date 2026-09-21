"""Admin dashboard statistics (§24 reports, §34)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import serializers
from rest_framework import status as http_status

from accounts.models import Role
from accounts.permissions import IsAdminRole
from appointments.models import Appointment
from common.responses import error_response, success_response
from doctors.models import Doctor
from reports.models import AuditEvent

User = get_user_model()


def _django_error_to_drf(exc):
    """Convert Django model ValidationError / IntegrityError to DRF 400."""
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, "message_dict") and exc.message_dict:
            raise serializers.ValidationError(exc.message_dict)
        raise serializers.ValidationError({"non_field_errors": list(exc.messages)})
    raise serializers.ValidationError(
        {"non_field_errors": ["A record with these details already exists."]}
    )


class AdminUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=60)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=("patient", "doctor"))

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        value = value.strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        try:
            user.full_clean(exclude={"password"})
            user.save()
        except (DjangoValidationError, IntegrityError) as exc:
            _django_error_to_drf(exc)
        return user


class AdminDoctorCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=60)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    qualifications = serializers.CharField(required=False, allow_blank=True)
    experience_years = serializers.IntegerField(required=False, min_value=0, default=0)
    consultation_fee = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal("0"))
    bio = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True, max_length=100)
    office_address = serializers.CharField(required=False, allow_blank=True)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        value = value.strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        profile_data = {
            key: validated_data.pop(key)
            for key in ("qualifications", "experience_years", "consultation_fee", "bio", "city", "office_address")
            if key in validated_data
        }
        try:
            with transaction.atomic():
                user = User.objects.create_user(**validated_data, password=password, role="doctor")
                doctor = Doctor.objects.create(user=user, **profile_data)
        except (DjangoValidationError, IntegrityError) as exc:
            _django_error_to_drf(exc)
        return doctor


def record(actor, action, target="", detail=""):
    AuditEvent.objects.create(actor=actor, action=action, target=target, detail=detail)


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


class AdminUserCreateView(APIView):
    permission_classes = (IsAuthenticated, IsAdminRole)

    def post(self, request):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        record(request.user, "user.created", user.username, f"Created {user.role} account")
        from accounts.serializers import user_payload
        return success_response(data=user_payload(user), message="User created.", status_code=201)


class AdminDoctorCreateView(APIView):
    permission_classes = (IsAuthenticated, IsAdminRole)

    def post(self, request):
        serializer = AdminDoctorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        doctor = serializer.save()
        record(request.user, "doctor.created", str(doctor.pk), f"Created Dr. {doctor.user.get_full_name()}")
        from doctors.serializers import DoctorSerializer
        return success_response(data=DoctorSerializer(doctor).data, message="Doctor created.", status_code=201)


class AdminUserDeleteView(APIView):
    """DELETE /api/admin/users/{id}/ — remove a patient or doctor account (§34)."""

    permission_classes = (IsAuthenticated, IsAdminRole)

    def delete(self, request, pk: int):
        if request.user.pk == pk:
            return error_response(message="You cannot delete your own account.")
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return error_response(
                message="User not found.", status_code=http_status.HTTP_404_NOT_FOUND
            )
        if user.is_superuser or user.role == Role.ADMIN:
            return error_response(message="Admin accounts cannot be deleted here.")
        label = user.get_full_name() or user.username
        with transaction.atomic():
            # Cascades: profile, appointments, reviews, notifications, audit rows.
            user.delete()
            record(
                request.user,
                "user.deleted",
                user.username,
                f"Deleted {user.role} account ({label})",
            )
        return success_response(message="User deleted.", data={"id": pk})


class AdminDoctorDeleteView(APIView):
    """DELETE /api/admin/doctors/{id}/ — remove a doctor profile and account (§34)."""

    permission_classes = (IsAuthenticated, IsAdminRole)

    def delete(self, request, pk: int):
        try:
            doctor = Doctor.objects.select_related("user").get(pk=pk)
        except Doctor.DoesNotExist:
            return error_response(
                message="Doctor not found.", status_code=http_status.HTTP_404_NOT_FOUND
            )
        user = doctor.user
        label = user.get_full_name() or user.username
        with transaction.atomic():
            # Deleting the account cascades to the Doctor profile, appointments,
            # availability, reviews and notifications.
            user.delete()
            record(
                request.user,
                "doctor.deleted",
                str(pk),
                f"Deleted Dr. {label} and their account",
            )
        return success_response(message="Doctor deleted.", data={"id": pk})


class AdminAuditView(APIView):
    permission_classes = (IsAuthenticated, IsAdminRole)

    def get(self, request):
        events = AuditEvent.objects.select_related("actor")[:50]
        data = [{
            "id": event.id,
            "action": event.action,
            "target": event.target,
            "detail": event.detail,
            "actor": event.actor.get_full_name() if event.actor else "System",
            "created_at": event.created_at.isoformat(),
        } for event in events]
        return success_response(data=data)

