"""
ASGI config for config project.

PHASE 13 realtime: plain HTTP is served by Django's ASGI app, while WebSocket
connections (/ws/notifications/) are routed to their consumers.
Served by Daphne (dev: "daphne" in INSTALLED_APPS replaces runserver).
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

# Import WebSocket routing only after Django is set up (consumers touch models).
from notifications.routing import websocket_urlpatterns as notification_ws  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(notification_ws),
    }
)
