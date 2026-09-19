"""Review serializers (§24 reviews, §33)."""

from rest_framework import serializers

from appointments.models import AppointmentStatus
from reviews.models import Review


class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ("id", "appointment", "patient", "doctor", "rating", "comment")
        read_only_fields = ("patient", "doctor")

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
