"""Doctor discovery + schedule management (§24 doctors, §27)."""

from datetime import date, datetime

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
from doctors.models import Availability, AvailabilityBreak, Doctor, ScheduleException
from doctors.scheduling import available_slots
from doctors.serializers import (
    AvailabilitySerializer,
    AvailabilityBreakSerializer,
    DoctorSerializer,
    DoctorWriteSerializer,
    ScheduleExceptionSerializer,
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
                | Q(office_address__icontains=search)
            )
        specialty = params.get("specialty")
        if specialty:
            queryset = queryset.filter(specialties__id=specialty)
        city = params.get("city")
        if city:
            # Location filter: matches the doctor's own practice city *or* the
            # city of any hospital they are linked to.
            queryset = queryset.filter(
                Q(city__icontains=city) | Q(hospitals__city__icontains=city)
            )
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
        slots = [
            {"start_time": start.strftime("%H:%M"), "end_time": end.strftime("%H:%M")}
            for start, end in available_slots(doctor, target)
        ]
        return success_response(
            data={"doctor": doctor.pk, "date": target.isoformat(), "slots": slots}
        )


class DoctorAvailableDaysView(APIView):
    """GET /api/doctors/{id}/available-days/?year=YYYY&month=MM
    Returns which days in a month the doctor has available slots."""

    permission_classes = (AllowAny,)

    def get(self, request, pk: int):
        import calendar

        try:
            doctor = Doctor.objects.get(pk=pk)
        except Doctor.DoesNotExist:
            return error_response(
                message="The requested resource was not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        today = date.today()
        try:
            year = int(request.query_params.get("year", today.year))
            month = int(request.query_params.get("month", today.month))
        except (TypeError, ValueError):
            year, month = today.year, today.month

        active_weekdays = set(
            Availability.objects.filter(
                doctor=doctor, is_active=True
            ).values_list("weekday", flat=True)
        )

        _, days_in_month = calendar.monthrange(year, month)
        available_days = []
        for day in range(1, days_in_month + 1):
            d = date(year, month, day)
            if d < today:
                continue
            if d.weekday() not in active_weekdays:
                continue
            if ScheduleException.objects.filter(
                doctor=doctor, date=d, start_time__isnull=True
            ).exists():
                continue
            if available_slots(doctor, d):
                available_days.append(d.isoformat())

        return success_response(
            data={
                "doctor": doctor.pk,
                "year": year,
                "month": month,
                "available_days": available_days,
            }
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
        return success_response(data=DoctorSerializer(self._doctor(request), context={"request": request}).data)

    def patch(self, request):
        doctor = self._doctor(request)
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        # Display name lives on the linked User; professional fields on Doctor.
        first_name = data.pop("first_name", None)
        last_name = data.pop("last_name", None)
        if first_name is not None or last_name is not None:
            user = doctor.user
            if first_name is not None:
                user.first_name = str(first_name).strip()
            if last_name is not None:
                user.last_name = str(last_name).strip()
            user.save(update_fields=["first_name", "last_name", "updated_at"])
        serializer = DoctorWriteSerializer(doctor, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=DoctorSerializer(serializer.instance, context={"request": request}).data,
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


class AvailabilityBreakListView(APIView):
    """GET/POST breaks inside one of the current doctor's weekly windows."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _window(self, request, pk: int):
        try:
            return Availability.objects.get(pk=pk, doctor=request.user.doctor)
        except (Availability.DoesNotExist, Doctor.DoesNotExist):
            return None

    def get(self, request, pk: int):
        window = self._window(request, pk)
        if window is None:
            return error_response(message="The requested resource was not found.", status_code=http_status.HTTP_404_NOT_FOUND)
        return success_response(data=AvailabilityBreakSerializer(window.breaks.all(), many=True).data)

    def post(self, request, pk: int):
        window = self._window(request, pk)
        if window is None:
            return error_response(message="The requested resource was not found.", status_code=http_status.HTTP_404_NOT_FOUND)
        serializer = AvailabilityBreakSerializer(data=request.data, context={"availability": window})
        serializer.is_valid(raise_exception=True)
        serializer.save(availability=window)
        return success_response(data=serializer.data, message="Break added.", status_code=http_status.HTTP_201_CREATED)


class AvailabilityBreakDetailView(APIView):
    """PATCH/DELETE a break owned by the current doctor."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _break(self, request, pk: int):
        try:
            return AvailabilityBreak.objects.select_related("availability").get(
                pk=pk, availability__doctor=request.user.doctor
            )
        except (AvailabilityBreak.DoesNotExist, Doctor.DoesNotExist):
            return None

    def patch(self, request, pk: int):
        item = self._break(request, pk)
        if item is None:
            return error_response(message="The requested resource was not found.", status_code=http_status.HTTP_404_NOT_FOUND)
        serializer = AvailabilityBreakSerializer(item, data=request.data, partial=True, context={"availability": item.availability})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message="Break updated.")

    def delete(self, request, pk: int):
        item = self._break(request, pk)
        if item is None:
            return error_response(message="The requested resource was not found.", status_code=http_status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class ScheduleExceptionListView(APIView):
    """GET/POST one-off closures, temporary unavailability, and holidays."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _doctor(self, request):
        return Doctor.objects.get_or_create(user=request.user)[0]

    def get(self, request):
        return success_response(data=ScheduleExceptionSerializer(self._doctor(request).schedule_exceptions.all(), many=True).data)

    def post(self, request):
        serializer = ScheduleExceptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(doctor=self._doctor(request))
        return success_response(data=serializer.data, message="Schedule exception added.", status_code=http_status.HTTP_201_CREATED)


class ScheduleExceptionDetailView(APIView):
    """PATCH/DELETE a one-off closure owned by the current doctor."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _exception(self, request, pk: int):
        try:
            return ScheduleException.objects.get(pk=pk, doctor=request.user.doctor)
        except (ScheduleException.DoesNotExist, Doctor.DoesNotExist):
            return None

    def patch(self, request, pk: int):
        item = self._exception(request, pk)
        if item is None:
            return error_response(message="The requested resource was not found.", status_code=http_status.HTTP_404_NOT_FOUND)
        serializer = ScheduleExceptionSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message="Schedule exception updated.")

    def delete(self, request, pk: int):
        item = self._exception(request, pk)
        if item is None:
            return error_response(message="The requested resource was not found.", status_code=http_status.HTTP_404_NOT_FOUND)
        item.delete()
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


class EarningsDashboardView(APIView):
    """GET /api/doctors/me/earnings/ — doctor earnings dashboard with daily/weekly/monthly breakdown."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def get(self, request):
        from datetime import timedelta
        from django.db.models import Count, Sum
        from django.utils import timezone
        from appointments.models import Appointment

        doctor = getattr(request.user, "doctor", None)
        if not doctor:
            return success_response(data=None, message="Doctor profile not found.")

        fee = float(doctor.consultation_fee or 0)
        today = timezone.now().date()

        # Completed appointments for earnings calculation
        completed_qs = Appointment.objects.filter(
            doctor=doctor, status="completed"
        )

        # Today
        today_count = completed_qs.filter(appointment_date=today).count()
        today_earnings = today_count * fee

        # This week (Mon–Sun)
        week_start = today - timedelta(days=today.weekday())
        week_count = completed_qs.filter(
            appointment_date__gte=week_start, appointment_date__lte=today
        ).count()
        week_earnings = week_count * fee

        # This month
        month_start = today.replace(day=1)
        month_count = completed_qs.filter(
            appointment_date__gte=month_start, appointment_date__lte=today
        ).count()
        month_earnings = month_count * fee

        # Last 30 days daily breakdown
        thirty_days_ago = today - timedelta(days=29)
        daily_data = (
            completed_qs.filter(appointment_date__gte=thirty_days_ago)
            .values("appointment_date")
            .annotate(count=Count("id"))
            .order_by("appointment_date")
        )
        daily_map = {str(d["appointment_date"]): d["count"] for d in daily_data}
        daily_breakdown = []
        for i in range(30):
            d = thirty_days_ago + timedelta(days=i)
            count = daily_map.get(str(d), 0)
            daily_breakdown.append({
                "date": str(d),
                "appointments": count,
                "earnings": round(count * fee, 2),
            })

        # This week day-by-day breakdown
        week_daily = []
        for i in range(7):
            d = week_start + timedelta(days=i)
            if d > today:
                break
            count = completed_qs.filter(appointment_date=d).count()
            week_daily.append({
                "date": str(d),
                "day": d.strftime("%A"),
                "appointments": count,
                "earnings": round(count * fee, 2),
            })

        return success_response(data={
            "consultation_fee": fee,
            "today": {"appointments": today_count, "earnings": round(today_earnings, 2)},
            "this_week": {"appointments": week_count, "earnings": round(week_earnings, 2)},
            "this_month": {"appointments": month_count, "earnings": round(month_earnings, 2)},
            "daily_30_days": daily_breakdown,
            "week_daily": week_daily,
        })
