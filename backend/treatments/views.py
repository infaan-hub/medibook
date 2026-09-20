"""Medical treatment API — doctor CRUD for patient treatments."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsDoctor
from common.responses import success_response
from patients.models import Patient
from treatments.models import MedicalTreatment
from treatments.serializers import (
    MedicalTreatmentSerializer,
    MedicalTreatmentCreateSerializer,
)


class PatientDetailView(APIView):
    """GET /api/patients/<user_id>/ — view a patient's profile (doctors with appointments only)."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def get(self, request, user_id):
        from appointments.models import Appointment

        # Check if this doctor has any appointment with this patient
        doctor_profile = getattr(request.user, "doctor", None)
        if not doctor_profile:
            return success_response(data=None, message="Doctor profile not found.")

        has_appointment = Appointment.objects.filter(
            doctor=doctor_profile,
            patient_id=user_id,
        ).exists()

        if not has_appointment:
            return success_response(data=None, message="Access denied. No appointment with this patient.")

        try:
            patient = Patient.objects.get(user_id=user_id)
        except Patient.DoesNotExist:
            return success_response(data=None, message="Patient profile not found.")
        from patients.serializers import PatientSerializer
        return success_response(data=PatientSerializer(patient).data)


class TreatmentListCreateView(APIView):
    """GET /api/treatments/?patient=<id> — list treatments for a patient (doctor's own).
    POST /api/treatments/ — create a new treatment record."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def get(self, request):
        doctor = getattr(request.user, "doctor", None)
        if not doctor:
            return success_response(data=[], message="Doctor profile not found.")

        patient_id = request.query_params.get("patient")
        qs = MedicalTreatment.objects.filter(doctor=doctor)
        if patient_id:
            qs = qs.filter(patient_id=patient_id)

        serializer = MedicalTreatmentSerializer(qs, many=True)
        return success_response(data=serializer.data)

    def post(self, request):
        doctor = getattr(request.user, "doctor", None)
        if not doctor:
            return success_response(data=None, message="Doctor profile not found.")

        serializer = MedicalTreatmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        treatment = serializer.save(doctor=doctor)
        return success_response(
            data=MedicalTreatmentSerializer(treatment).data,
            message="Treatment record created.",
        )


class TreatmentDetailView(APIView):
    """GET/PATCH/DELETE /api/treatments/<id>/ — view/update/delete a treatment (doctor's own)."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def _get_treatment(self, request, pk):
        doctor = getattr(request.user, "doctor", None)
        if not doctor:
            return None
        try:
            return MedicalTreatment.objects.get(pk=pk, doctor=doctor)
        except MedicalTreatment.DoesNotExist:
            return None

    def get(self, request, pk):
        treatment = self._get_treatment(request, pk)
        if not treatment:
            return success_response(data=None, message="Treatment not found.")
        return success_response(data=MedicalTreatmentSerializer(treatment).data)

    def patch(self, request, pk):
        treatment = self._get_treatment(request, pk)
        if not treatment:
            return success_response(data=None, message="Treatment not found.")
        serializer = MedicalTreatmentSerializer(treatment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=serializer.data, message="Treatment updated."
        )

    def delete(self, request, pk):
        treatment = self._get_treatment(request, pk)
        if not treatment:
            return success_response(data=None, message="Treatment not found.")
        treatment.delete()
        return success_response(message="Treatment deleted.")


class DoctorPatientListView(APIView):
    """GET /api/treatments/patients/ — list patients who have appointments with this doctor."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def get(self, request):
        from appointments.models import Appointment
        from patients.serializers import PatientSerializer

        doctor = getattr(request.user, "doctor", None)
        if not doctor:
            return success_response(data=[], message="Doctor profile not found.")

        patient_ids = (
            Appointment.objects.filter(doctor=doctor)
            .values_list("patient_id", flat=True)
            .distinct()
        )
        patients = Patient.objects.filter(user_id__in=patient_ids)
        return success_response(data=PatientSerializer(patients, many=True).data)
