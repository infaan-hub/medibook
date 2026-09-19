"""Notification tests — creation, read/unread, filtering, deletion."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from notifications.helpers import notify
from notifications.models import Notification, NotificationType

User = get_user_model()
PASSWORD = "StrongPass123!"


def _user(email: str, role: str, **extra):
    return User.objects.create_user(
        email=email, password=PASSWORD, role=role, is_verified=True, **extra
    )


def _auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class NotificationTests(TestCase):
    def setUp(self):
        self.user = _user("user@example.com", "patient")
        self.other = _user("other@example.com", "patient")

    def test_notify_creates_notification(self):
        notify(self.user, NotificationType.SYSTEM, "Test notification")
        self.assertEqual(Notification.objects.count(), 1)
        n = Notification.objects.first()
        self.assertEqual(n.recipient, self.user)
        self.assertEqual(n.notification_type, NotificationType.SYSTEM)
        self.assertFalse(n.is_read)

    def test_list_notifications(self):
        notify(self.user, NotificationType.SYSTEM, "Hello")
        notify(self.user, NotificationType.REVIEW, "New review")
        client = _auth(self.user)
        resp = client.get("/api/notifications/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["data"]["count"], 2)

    def test_filter_unread(self):
        n = notify(self.user, NotificationType.SYSTEM, "Read me")
        n.is_read = True
        n.save(update_fields=["is_read"])
        notify(self.user, NotificationType.REVIEW, "Unread")
        client = _auth(self.user)
        resp = client.get("/api/notifications/?unread=1")
        self.assertEqual(resp.data["data"]["count"], 1)

    def test_mark_read(self):
        n = notify(self.user, NotificationType.SYSTEM, "Mark me")
        client = _auth(self.user)
        resp = client.patch(f"/api/notifications/{n.pk}/", {"is_read": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        n.refresh_from_db()
        self.assertTrue(n.is_read)

    def test_delete_notification(self):
        n = notify(self.user, NotificationType.SYSTEM, "Delete me")
        client = _auth(self.user)
        resp = client.delete(f"/api/notifications/{n.pk}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Notification.objects.filter(pk=n.pk).exists())

    def test_cannot_see_other_users_notifications(self):
        notify(self.other, NotificationType.SYSTEM, "Private")
        client = _auth(self.user)
        resp = client.get("/api/notifications/")
        self.assertEqual(resp.data["data"]["count"], 0)

    def test_only_own_notifications_deleted(self):
        n1 = notify(self.user, NotificationType.SYSTEM, "Mine")
        n2 = notify(self.other, NotificationType.SYSTEM, "Theirs")
        client = _auth(self.user)
        client.delete(f"/api/notifications/{n1.pk}/")
        self.assertTrue(Notification.objects.filter(pk=n2.pk).exists())
