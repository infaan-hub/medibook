"""Specialty catalog (§24 specialties, §26 Specialty)."""

from django.db import models

from common.models import TimeStampedModel


class Specialty(TimeStampedModel):
    """Medical specialty used for doctor filtering (§20 search/filter)."""

    name = models.CharField(max_length=100, unique=True, db_index=True)
    patient_friendly_name = models.CharField(
        max_length=150, blank=True, default="",
        help_text="Plain-language name patients understand (e.g. 'Children's doctor' for Pediatrics).",
    )
    description = models.TextField(blank=True, default="")
    what_to_expect = models.TextField(
        blank=True, default="",
        help_text="Patient-friendly explanation: what problems this doctor handles, symptoms to watch for.",
    )
    icon_url = models.URLField(blank=True, default="")

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.patient_friendly_name or self.name

