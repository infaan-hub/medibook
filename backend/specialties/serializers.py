"""Specialty serializers (§24 specialties)."""

from rest_framework import serializers

from specialties.models import Specialty


class SpecialtySerializer(serializers.ModelSerializer):
    class Meta:
        model = Specialty
        fields = ("id", "name", "patient_friendly_name", "description", "what_to_expect", "icon_url")
