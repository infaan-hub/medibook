"""WebSocket consumer — one personal live channel per signed-in user.

Part of the PHASE 13 realtime push: whenever a notification row is created or
an appointment changes, the server pushes an event into the recipient's group
(`user_<id>`) so open browsers update instantly without refreshing.
"""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from notifications.helpers import user_group_name


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Personal push channel at ``/ws/notifications/?token=<access>``.

    Browsers cannot set an Authorization header on the WebSocket handshake, so
    the SimpleJWT access token rides in the ``?token=`` query parameter.
    Missing/invalid tokens are rejected with close code 4001 before accept.

    Frames:
    - server → client: ``{"event": "<name>", "payload": {...}}``
    - client → server: ``{"type": "ping"}`` answered with ``{"event": "pong"}``
    """

    async def connect(self):
        token = self._token_from_query()
        user = await self._user_for_token(token) if token else None
        if user is None:
            await self.close(code=4001)
            return
        self.user = user
        self.group_name = user_group_name(user.pk)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "payload": {"user_id": user.pk}})

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"event": "pong", "payload": {}})

    async def notify_event(self, event):
        """Group-message handler for ``{"type": "notify.event", ...}`` sends."""
        await self.send_json(
            {"event": event.get("event", ""), "payload": event.get("payload", {})}
        )

    def _token_from_query(self):
        query = self.scope.get("query_string", b"")
        if isinstance(query, bytes):
            query = query.decode()
        values = parse_qs(query or "").get("token")
        return values[0] if values else None

    @staticmethod
    @database_sync_to_async
    def _user_for_token(token):
        """Resolve a SimpleJWT access token to an active user (or None)."""
        try:
            validated = AccessToken(token)
        except TokenError:
            return None
        user_model = get_user_model()
        try:
            return user_model.objects.get(pk=validated["user_id"], is_active=True)
        except (user_model.DoesNotExist, KeyError):
            return None
