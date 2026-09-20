"""Doctor serializers (§24 doctors)."""

from rest_framework import serializers

from doctors.models import Availability, AvailabilityBreak, Doctor, ScheduleException


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


class AvailabilityBreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilityBreak
        fields = ("id", "start_time", "end_time")

    def validate(self, attrs: dict) -> dict:
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        window = self.context["availability"]
        if start >= end:
            raise serializers.ValidationError({"end_time": ["End time must be after start time."]})
        if start < window.start_time or end > window.end_time:
            raise serializers.ValidationError({"start_time": ["A break must stay within its availability window."]})
        existing = AvailabilityBreak.objects.filter(availability=window).exclude(pk=getattr(self.instance, "pk", None))
        if existing.filter(start_time__lt=end, end_time__gt=start).exists():
            raise serializers.ValidationError({"start_time": ["Breaks cannot overlap."]})
        return attrs


class ScheduleExceptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleException
        fields = ("id", "date", "start_time", "end_time", "reason")

    def validate(self, attrs: dict) -> dict:
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if (start is None) != (end is None):
            raise serializers.ValidationError("Provide both start_time and end_time, or neither for a full-day closure.")
        if start is not None and end <= start:
            raise serializers.ValidationError({"end_time": ["End time must be after start time."]})
        return attrs


class DoctorSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    profile_image = serializers.SerializerMethodField()
    specialties = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    hospitals = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = Doctor
        fields = (
            "id", "email", "first_name", "last_name", "profile_image", "specialties",
            "hospitals", "qualifications", "experience_years",
            "consultation_fee", "bio", "is_available",
            "average_rating", "total_reviews",
        )
        read_only_fields = ("average_rating", "total_reviews")

    def get_profile_image(self, obj) -> str | None:
        """Surface the linked user's profile picture for doctor cards."""
        user = getattr(obj, "user", None)
        image = getattr(user, "profile_image", None)
        url = image.url if image else None
        if not url:
            return None
        if url.startswith("http"):
            return url
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(url)
        return url


class DoctorWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = (
            "specialties", "hospitals", "qualifications",
            "experience_years", "consultation_fee", "bio", "is_available",
        )
