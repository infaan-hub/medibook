"""Notification helper — one inbox row per event (§31)."""

from notifications.models import Notification, NotificationType

_TITLES = {
    NotificationType.APPOINTMENT_REQUEST: "New appointment request",
    NotificationType.APPOINTMENT_CONFIRMED: "Appointment confirmed",
    NotificationType.APPOINTMENT_CANCELLED: "Appointment cancelled",
    NotificationType.APPOINTMENT_REJECTED: "Appointment rejected",
    NotificationType.APPOINTMENT_REMINDER: "Appointment reminder",
    NotificationType.REVIEW: "New review",
    NotificationType.SYSTEM: "MediBook update",
}


def notify(recipient, notification_type: str, message: str, appointment=None):
    """Create the in-app notification row (push delivery is PHASE 13)."""
    return Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=_TITLES.get(notification_type, "MediBook update"),
        message=message,
        related_appointment=appointment,
    )
