"""Doctor profile + weekly availability (§24 doctors, §26 Doctor/Availability)."""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from common.models import TimeStampedModel


class Doctor(TimeStampedModel):
    """Professional profile linked 1:1 to the doctor user (§8)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="doctor"
    )
    hospitals = models.ManyToManyField(
        "hospitals.Hospital", related_name="doctors", blank=True
    )
    specialties = models.ManyToManyField(
        "specialties.Specialty", related_name="doctors", blank=True
    )
    qualifications = models.TextField(blank=True, default="")
    experience_years = models.PositiveIntegerField(
        default=0, validators=[MinValueValidator(0), MaxValueValidator(80)]
    )
    consultation_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
    )
    bio = models.TextField(blank=True, default="")
    is_available = models.BooleanField(default=True, db_index=True)
    average_rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
    )
    total_reviews = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=("is_available", "average_rating"),
                name="dr_avail_rat_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"doctor:{self.user_id}"


class Availability(TimeStampedModel):
    """Weekly recurring availability windows set by the doctor (§12)."""

    doctor = models.ForeignKey(
        Doctor, on_delete=models.CASCADE, related_name="availabilities"
    )
    weekday = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(6)],
        help_text="0=Monday … 6=Sunday.",
    )
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_duration_minutes = models.PositiveIntegerField(
        default=30, validators=[MinValueValidator(5), MaxValueValidator(480)]
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("doctor", "weekday", "start_time")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="availability_end_after_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=("doctor", "weekday", "is_active"),
                name="avail_dk_wd_act_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"availability:{self.doctor_id}:{self.weekday}"


class AvailabilityBreak(TimeStampedModel):
    """A non-bookable interval inside one recurring availability window."""

    availability = models.ForeignKey(
        Availability, on_delete=models.CASCADE, related_name="breaks"
    )
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ("availability", "start_time")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="availability_break_end_after_start",
            ),
        ]

    def __str__(self) -> str:
        return f"break:{self.availability_id}:{self.start_time}-{self.end_time}"


class ScheduleException(TimeStampedModel):
    """One-off full-day or partial-day closure for a doctor (holidays included)."""

    doctor = models.ForeignKey(
        Doctor, on_delete=models.CASCADE, related_name="schedule_exceptions"
    )
    date = models.DateField(db_index=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("doctor", "date", "start_time")
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(start_time__isnull=True, end_time__isnull=True)
                    | models.Q(start_time__isnull=False, end_time__isnull=False)
                ),
                name="schedule_exception_times_pair",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(start_time__isnull=True, end_time__isnull=True)
                    | models.Q(end_time__gt=models.F("start_time"))
                ),
                name="schedule_exception_end_after_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=("doctor", "date"),
                name="sched_exc_dk_dt_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"exception:{self.doctor_id}:{self.date}"

