"""Doctor serializers (§24 doctors)."""

from rest_framework import serializers

from doctors.models import Availability, Doctor


class AvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Availability
        fields = (
            "id", "weekday", "start_time", "end_time",
            "slot_duration_minutes", "is_active",
        )

    def validate(self, attrs: dict) -> dict:
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_time": ["End time must be after start time."]}
            )
        return attrs


class DoctorSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    specialties = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    hospitals = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = Doctor
        fields = (
            "id", "email", "first_name", "last_name", "specialties",
            "hospitals", "qualifications", "experience_years",
            "consultation_fee", "bio", "is_available",
            "average_rating", "total_reviews",
        )
        read_only_fields = ("average_rating", "total_reviews")


class DoctorWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = (
            "specialties", "hospitals", "qualifications",
            "experience_years", "consultation_fee", "bio", "is_available",
        )
