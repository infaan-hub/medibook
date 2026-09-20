"""Medical treatments: doctor records treatment notes per patient appointment."""

from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class MedicalTreatment(TimeStampedModel):
    """A treatment record created by a doctor for a patient."""

    doctor = models.ForeignKey(
        "doctors.Doctor", on_delete=models.CASCADE, related_name="treatments"
    )
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="treatments"
    )
    appointment = models.ForeignKey(
        "appointments.Appointment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="treatments",
    )
    diagnosis = models.CharField(max_length=255, blank=True, default="")
    treatment_notes = models.TextField(blank=True, default="")
    prescription = models.TextField(blank=True, default="")
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("doctor", "patient"), name="treat_dr_pat_idx"),
        ]

    def __str__(self) -> str:
        return f"treatment:{self.pk}:dr{self.doctor_id}->pat{self.patient_id}"
