"""In-app + push notification records (§24 notifications, §26, §31)."""

from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class NotificationType(models.TextChoices):
    APPOINTMENT_REQUEST = "appointment_request", "Appointment Request"
    APPOINTMENT_CONFIRMED = "appointment_confirmed", "Appointment Confirmed"
    APPOINTMENT_CANCELLED = "appointment_cancelled", "Appointment Cancelled"
    APPOINTMENT_REJECTED = "appointment_rejected", "Appointment Rejected"
    APPOINTMENT_REMINDER = "appointment_reminder", "Appointment Reminder"
    REVIEW = "review", "Review"
    SYSTEM = "system", "System"


class Notification(TimeStampedModel):
    """One notification row per recipient (in-app inbox + push log)."""

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=30,
        choices=NotificationType.choices,
        default=NotificationType.SYSTEM,
        db_index=True,
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    related_appointment = models.ForeignKey(
        "appointments.Appointment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    is_read = models.BooleanField(default=False, db_index=True)
    # Push delivery tracking (§31): payload sent + provider message id.
    push_sent = models.BooleanField(default=False)
    push_provider_id = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("recipient", "is_read", "-created_at")),
            models.Index(fields=("recipient", "notification_type")),
        ]

    def __str__(self) -> str:
        return f"notification:{self.pk}:{self.notification_type}"


class PushSubscription(TimeStampedModel):
    """One device subscription per user (endpoint is globally unique)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    # Web Push keys + optional FCM token (§31 delivery).
    p256dh_key = models.CharField(max_length=200, blank=True, default="")
    auth_key = models.CharField(max_length=100, blank=True, default="")
    fcm_token = models.CharField(max_length=300, blank=True, default="")
    device_info = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("user", "is_active"))]

    def __str__(self) -> str:
        return f"push:{self.user_id}:{self.pk}"


