"""Hospital serializers (§24 hospitals)."""

from rest_framework import serializers

from hospitals.models import Hospital


class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = (
            "id", "name", "city", "address", "phone",
            "email", "location_details",
        )
