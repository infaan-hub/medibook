"""Notification helper — one inbox row per event (§31) + realtime WS push.

Every notification created here is also pushed to the recipient's personal
WebSocket channel (group ``user_<id>``) so open browsers update instantly.
Appointment mutations additionally broadcast ``appointment.*`` events to both
parties via :func:`broadcast_appointment_event`.
"""

from asgiref.sync import async_to_sync
from django.db import transaction

from notifications.models import Notification, NotificationType


def user_group_name(user_id) -> str:
    """Channel-layer group that receives everything addressed to one user."""
    return f"user_{user_id}"

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
    """Create the in-app notification row and push it to the live channel."""
    notification = Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=_TITLES.get(notification_type, "MediBook update"),
        message=message,
        related_appointment=appointment,
    )
    _push(
        "notification.created",
        _notification_payload(notification),
        (recipient.pk,),
    )
    return notification


def broadcast_appointment_event(appointment, event: str, recipient_ids=()) -> None:
    """Push an appointment change (``appointment.created``/``appointment.updated``)
    to every listed user id — patient and doctor see updates live."""
    _push(event, _appointment_payload(appointment), recipient_ids)


def _notification_payload(notification) -> dict:
    return {
        "id": notification.pk,
        "notification_type": notification.notification_type,
        "title": notification.title,
        "message": notification.message,
        "related_appointment": notification.related_appointment_id,
        "is_read": notification.is_read,
        "created_at": (
            notification.created_at.isoformat() if notification.created_at else None
        ),
    }


def _appointment_payload(appointment) -> dict:
    return {
        "id": appointment.pk,
        "status": appointment.status,
        "appointment_date": str(appointment.appointment_date),
        "start_time": str(appointment.start_time) if appointment.start_time else None,
        "end_time": str(appointment.end_time) if appointment.end_time else None,
    }


def _push(event: str, payload: dict, recipient_ids) -> None:
    """Group-send one event to each recipient after the DB transaction commits."""
    try:
        from channels.layers import get_channel_layer
    except ImportError:  # channels not installed — in-app rows still persist
        return
    layer = get_channel_layer()
    if layer is None:
        return
    targets = {user_id for user_id in recipient_ids if user_id is not None}
    if not targets:
        return

    def _send():
        for user_id in targets:
            async_to_sync(layer.group_send)(
                user_group_name(user_id),
                {"type": "notify.event", "event": event, "payload": payload},
            )

    transaction.on_commit(_send)

