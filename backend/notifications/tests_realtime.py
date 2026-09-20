"""Realtime WebSocket tests — auth, keepalive, group push (PHASE 13)."""

from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application
from notifications.consumers import user_group_name
from notifications.helpers import notify
from notifications.models import NotificationType

User = get_user_model()
PASSWORD = "StrongPass123!"
TIMEOUT = 5


class NotificationSocketTests(TransactionTestCase):
    """WS auth handshake, keepalive frames, and live group push.

    TransactionTestCase (no wrapping atomic) so ``transaction.on_commit``
    pushes inside ``notify()`` fire immediately during the test.
    """

    def _comm(self, token=None) -> WebsocketCommunicator:
        path = "/ws/notifications/"
        if token:
            path += f"?token={token}"
        return WebsocketCommunicator(application, path)

    @database_sync_to_async
    def _make_user(self, username: str, email: str, role: str):
        return User.objects.create_user(
            username=username, email=email, password=PASSWORD, role=role
        )

    @database_sync_to_async
    def _notify(self, user):
        notify(user, NotificationType.SYSTEM, "Live hello")

    async def test_rejects_missing_token(self):
        communicator = self._comm()
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_rejects_invalid_token(self):
        communicator = self._comm("not-a-real-jwt")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_connects_with_valid_token_and_receives_live_push(self):
        user = await self._make_user("wsuser", "wsuser@example.com", "patient")
        token = AccessToken.for_user(user)
        communicator = self._comm(token)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        try:
            hello = await communicator.receive_json_from(timeout=TIMEOUT)
            self.assertEqual(hello["event"], "connected")
            self.assertEqual(hello["payload"]["user_id"], user.pk)

            await self._notify(user)
            push = await communicator.receive_json_from(timeout=TIMEOUT)
            self.assertEqual(push["event"], "notification.created")
            self.assertEqual(push["payload"]["message"], "Live hello")
        finally:
            await communicator.disconnect()

    async def test_ping_replies_pong(self):
        user = await self._make_user("wsping", "wsping@example.com", "doctor")
        token = AccessToken.for_user(user)
        communicator = self._comm(token)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        try:
            await communicator.receive_json_from(timeout=TIMEOUT)  # connected
            await communicator.send_json_to({"type": "ping"})
            pong = await communicator.receive_json_from(timeout=TIMEOUT)
            self.assertEqual(pong["event"], "pong")
        finally:
            await communicator.disconnect()

    async def test_group_send_reaches_open_socket(self):
        user = await self._make_user("wsgrp", "wsgrp@example.com", "patient")
        token = AccessToken.for_user(user)
        communicator = self._comm(token)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        try:
            await communicator.receive_json_from(timeout=TIMEOUT)  # connected
            layer = get_channel_layer()
            await layer.group_send(
                user_group_name(user.pk),
                {
                    "type": "notify.event",
                    "event": "appointment.updated",
                    "payload": {"id": 7, "status": "confirmed"},
                },
            )
            push = await communicator.receive_json_from(timeout=TIMEOUT)
            self.assertEqual(push["event"], "appointment.updated")
            self.assertEqual(push["payload"]["status"], "confirmed")
        finally:
            await communicator.disconnect()
