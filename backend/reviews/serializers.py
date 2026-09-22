"""Review serializers (§24 reviews, §33)."""

from rest_framework import serializers

from appointments.models import AppointmentStatus
from reviews.models import Review


class ReviewSerializer(serializers.ModelSerializer):
    # Patients reviewing their own history need to see *who* they reviewed
    # (the doctor PK alone is not presentable). SerializerMethodField keeps the
    # joined user fields out of the writable schema.
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = (
            "id", "appointment", "patient", "doctor", "doctor_name",
            "rating", "comment", "is_visible", "created_at",
        )
        read_only_fields = ("patient", "doctor", "is_visible", "created_at")

    def get_doctor_name(self, obj: Review) -> str:
        user = obj.doctor.user
        full_name = user.get_full_name().strip()
        return f"Dr. {full_name}" if full_name else user.email

    def validate_appointment(self, value):
        request = self.context.get("request")
        if value.status != AppointmentStatus.COMPLETED:
            raise serializers.ValidationError(
                "Only completed appointments can be reviewed."
            )
        if request and value.patient_id != request.user.pk:
            raise serializers.ValidationError(
                "You can only review your own appointments."
            )
        if Review.objects.filter(appointment=value).exists():
            raise serializers.ValidationError(
                "This appointment already has a review."
            )
        return value
