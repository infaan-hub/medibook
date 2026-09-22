"""Patient profile — one per patient-role user (§24 patients, §26 Patient)."""

from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class Patient(TimeStampedModel):
    """Extended profile linked 1:1 to the patient user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="patient"
    )
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(
        max_length=10,
        choices=[("male", "Male"), ("female", "Female"), ("other", "Other")],
        blank=True,
        default="",
    )
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="", db_index=True)
    emergency_contact_name = models.CharField(max_length=150, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=16, blank=True, default="")
    blood_group = models.CharField(max_length=5, blank=True, default="")
    allergies = models.TextField(blank=True, default="")
    medical_history = models.TextField(blank=True, default="")
    reminder_preferences = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"patient:{self.user_id}"

