"""Specialty catalog (§24 specialties, §26 Specialty)."""

from django.db import models

from common.models import TimeStampedModel


class Specialty(TimeStampedModel):
    """Medical specialty used for doctor filtering (§20 search/filter)."""

    name = models.CharField(max_length=100, unique=True, db_index=True)
    description = models.TextField(blank=True, default="")
    icon_url = models.URLField(blank=True, default="")

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name

