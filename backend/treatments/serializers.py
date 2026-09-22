"""Medical treatment serializers."""

from rest_framework import serializers

from treatments.models import HealthRecord, MedicalTreatment


class MedicalTreatmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalTreatment
        fields = (
            "id", "doctor", "patient", "appointment",
            "diagnosis", "treatment_notes", "prescription",
            "follow_up_date", "follow_up_notes",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class MedicalTreatmentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalTreatment
        fields = (
            "id", "patient", "appointment",
            "diagnosis", "treatment_notes", "prescription",
            "follow_up_date", "follow_up_notes",
        )
        read_only_fields = ("id",)


class HealthRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthRecord
        fields = (
            "id", "patient", "doctor", "appointment", "file",
            "record_type", "title", "description", "created_at",
        )
        read_only_fields = ("id", "created_at")


class VisitHistorySerializer(serializers.ModelSerializer):
    """Read-only serializer for visit history timeline entries."""
    appointment_id = serializers.IntegerField(source="id", read_only=True)
    appointment_date = serializers.DateField(read_only=True)
    start_time = serializers.TimeField(read_only=True)
    end_time = serializers.TimeField(read_only=True)
    status = serializers.CharField(read_only=True)
    reason = serializers.CharField(read_only=True)
    notes = serializers.CharField(read_only=True)
    diagnosis = serializers.SerializerMethodField()
    treatment_notes = serializers.SerializerMethodField()
    prescription = serializers.SerializerMethodField()
    follow_up_date = serializers.SerializerMethodField()
    doctor_first_name = serializers.CharField(source="doctor.user.first_name", read_only=True)
    doctor_last_name = serializers.CharField(source="doctor.user.last_name", read_only=True)

    class Meta:
        model = "appointments.Appointment"
        fields = (
            "appointment_id", "appointment_date", "start_time", "end_time",
            "status", "reason", "notes",
            "diagnosis", "treatment_notes", "prescription", "follow_up_date",
            "doctor_first_name", "doctor_last_name",
        )

    def get_diagnosis(self, obj):
        treatment = getattr(obj, "_treatment", None)
        return treatment.diagnosis if treatment else None

    def get_treatment_notes(self, obj):
        treatment = getattr(obj, "_treatment", None)
        return treatment.treatment_notes if treatment else None

    def get_prescription(self, obj):
        treatment = getattr(obj, "_treatment", None)
        return treatment.prescription if treatment else None

    def get_follow_up_date(self, obj):
        treatment = getattr(obj, "_treatment", None)
        return treatment.follow_up_date if treatment else None
