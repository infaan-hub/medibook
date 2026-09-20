"""Patient profile serializers (§24 patients)."""

from rest_framework import serializers

from patients.models import Patient


class PatientSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)

    class Meta:
        model = Patient
        fields = (
            "id", "email", "first_name", "last_name",
            "date_of_birth", "gender", "address", "city",
            "emergency_contact_name", "emergency_contact_phone",
            "blood_group", "allergies", "medical_history",
        )
