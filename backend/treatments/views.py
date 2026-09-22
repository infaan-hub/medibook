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


class PatientVisitHistoryView(APIView):
    """GET /api/treatments/visit-history/?patient=<user_id> — doctor views visit timeline for a patient."""

    permission_classes = (IsAuthenticated, IsDoctor)

    def get(self, request):
        from django.db.models import Prefetch
        from appointments.models import Appointment

        doctor = getattr(request.user, "doctor", None)
        if not doctor:
            return success_response(data=[], message="Doctor profile not found.")

        patient_id = request.query_params.get("patient")
        if not patient_id:
            return success_response(data=[], message="Patient ID is required.")

        # Verify doctor has an appointment with this patient
        has_appointment = Appointment.objects.filter(
            doctor=doctor, patient_id=patient_id
        ).exists()
        if not has_appointment:
            return success_response(data=[], message="No appointments with this patient.")

        # Get completed appointments with treatment prefetch
        from treatments.models import MedicalTreatment

        treatments_qs = MedicalTreatment.objects.filter(doctor=doctor)
        appointments = (
            Appointment.objects.filter(doctor=doctor, patient_id=patient_id)
            .select_related("doctor__user")
            .prefetch_related(Prefetch("medical_treatments", queryset=treatments_qs, to_attr="_treatments_cache"))
            .order_by("-appointment_date", "-start_time")
        )

        # Attach treatment to each appointment
        results = []
        for appt in appointments:
            treatments = getattr(appt, "_treatments_cache", [])
            appt._treatment = treatments[0] if treatments else None
            results.append({
                "appointment_id": appt.id,
                "appointment_date": str(appt.appointment_date),
                "start_time": str(appt.start_time),
                "end_time": str(appt.end_time),
                "status": appt.status,
                "reason": appt.reason,
                "notes": appt.notes,
                "diagnosis": treatments[0].diagnosis if treatments else None,
                "treatment_notes": treatments[0].treatment_notes if treatments else None,
                "prescription": treatments[0].prescription if treatments else None,
                "follow_up_date": str(treatments[0].follow_up_date) if treatments and treatments[0].follow_up_date else None,
                "doctor_first_name": appt.doctor.user.first_name,
                "doctor_last_name": appt.doctor.user.last_name,
            })

        return success_response(data=results)
