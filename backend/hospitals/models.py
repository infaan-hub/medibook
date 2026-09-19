"""Healthcare facilities (§24 hospitals, §26 Hospital)."""

from django.db import models

from common.models import TimeStampedModel


class Hospital(TimeStampedModel):
    """Clinic/hospital where doctors practice (§11 facility info)."""

    name = models.CharField(max_length=200, db_index=True)
    city = models.CharField(max_length=100, db_index=True)
    address = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=16, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    location_details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return f"{self.name} ({self.city})"

