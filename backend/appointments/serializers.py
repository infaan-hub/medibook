"""Appointment serializers (§24 appointments)."""

from rest_framework import serializers

from appointments.models import Appointment


class AppointmentSerializer(serializers.ModelSerializer):
    patient_email = serializers.EmailField(source="patient.email", read_only=True)
    doctor = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Appointment
        fields = (
            "id", "patient", "patient_email", "doctor", "hospital",
            "appointment_date", "start_time", "end_time",
            "status", "reason", "notes", "cancel_reason",
        )
        read_only_fields = ("patient", "status")

    def validate(self, attrs: dict) -> dict:
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_time": ["End time must be after start time."]}
            )
        return attrs


class AppointmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=("confirmed", "completed", "cancelled", "rejected")
    )
    cancel_reason = serializers.CharField(
        required=False, allow_blank=True, max_length=1000
    )
    notes = serializers.CharField(required=False, allow_blank=True)
