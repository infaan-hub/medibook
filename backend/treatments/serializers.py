"""Medical treatment serializers."""

from rest_framework import serializers

from treatments.models import MedicalTreatment


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
