"""Patient profile serializers (§24 patients)."""

from rest_framework import serializers

from patients.models import Patient


class PatientSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Patient
        fields = (
            "id", "email", "date_of_birth", "gender", "address", "city",
            "emergency_contact_name", "emergency_contact_phone",
            "blood_group", "allergies", "medical_history",
        )
