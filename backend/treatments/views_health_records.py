"""Health records API — doctor uploads, patient views."""

from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsDoctor, IsPatient
from common.pagination import StandardResultsSetPagination
from common.responses import error_response, success_response
from treatments.models import HealthRecord
from treatments.serializers import HealthRecordSerializer


class HealthRecordListCreateView(APIView):
    """GET /api/health-records/ — patient views own records.
    POST /api/health-records/ — doctor uploads a record."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        if user.role == "patient":
            qs = HealthRecord.objects.filter(patient=user)
        elif user.role == "doctor":
            try:
                qs = HealthRecord.objects.filter(doctor=user.doctor)
            except Exception:
                qs = HealthRecord.objects.none()
        else:
            qs = HealthRecord.objects.none()

        patient_id = request.query_params.get("patient")
        if patient_id:
            qs = qs.filter(patient_id=patient_id)

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = HealthRecordSerializer(page or qs, many=True)
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return success_response(data=serializer.data)

    def post(self, request):
        if request.user.role != "doctor":
            return error_response(
                message="Only doctors can upload health records.",
                status_code=http_status.HTTP_403_FORBIDDEN,
            )
        try:
            doctor = request.user.doctor
        except Exception:
            return error_response(
                message="Doctor profile not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )

        data = request.data.copy()
        data["doctor"] = doctor.pk
        serializer = HealthRecordSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=serializer.data,
            message="Health record uploaded.",
            status_code=http_status.HTTP_201_CREATED,
        )


class HealthRecordDetailView(APIView):
    """DELETE /api/health-records/{id}/ — doctor deletes a record."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def delete(self, request, pk: int):
        try:
            record = HealthRecord.objects.get(pk=pk, doctor=request.user.doctor)
        except HealthRecord.DoesNotExist:
            return error_response(
                message="Record not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        record.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)
