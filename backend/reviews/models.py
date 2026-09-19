"""Completed-appointment reviews (§24 reviews, §26 Review, §33)."""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from common.models import TimeStampedModel


class Review(TimeStampedModel):
    """One review per completed appointment (patient → doctor)."""

    appointment = models.OneToOneField(
        "appointments.Appointment",
        on_delete=models.CASCADE,
        related_name="review",
    )
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="given_reviews",
    )
    doctor = models.ForeignKey(
        "doctors.Doctor", on_delete=models.CASCADE, related_name="reviews"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)], db_index=True
    )
    comment = models.TextField(blank=True, default="")
    is_visible = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("doctor", "is_visible", "-created_at")),
        ]

    def __str__(self) -> str:
        return f"review:{self.pk}:{self.rating}"

