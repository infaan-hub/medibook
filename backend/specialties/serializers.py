"""Specialty serializers (§24 specialties)."""

from rest_framework import serializers

from specialties.models import Specialty


class SpecialtySerializer(serializers.ModelSerializer):
    class Meta:
        model = Specialty
        fields = ("id", "name", "description", "icon_url")
