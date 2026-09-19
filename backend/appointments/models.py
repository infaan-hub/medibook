"""Appointment lifecycle: request → confirm → complete/cancel (§26 Appointment)."""

from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class AppointmentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    REJECTED = "rejected", "Rejected"


class Appointment(TimeStampedModel):
    """One booked slot: patient + doctor + UTC start/end + status."""

    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="patient_appointments",
    )
    doctor = models.ForeignKey(
        "doctors.Doctor", on_delete=models.CASCADE, related_name="appointments"
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="appointments",
    )
    appointment_date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(
        max_length=10,
        choices=AppointmentStatus.choices,
        default=AppointmentStatus.PENDING,
        db_index=True,
    )
    reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    cancel_reason = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-appointment_date", "-start_time")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="appointment_end_after_start",
            ),
            # Double-booking prevention (§26): one live row per slot.
            models.UniqueConstraint(
                fields=("doctor", "appointment_date", "start_time"),
                condition=~models.Q(status__in=("cancelled", "rejected")),
                name="uniq_live_doctor_slot",
            ),
        ]
        indexes = [
            models.Index(fields=("doctor", "appointment_date", "status")),
            models.Index(fields=("patient", "appointment_date", "status")),
        ]

    def __str__(self) -> str:
        return f"appointment:{self.pk}:{self.status}"

