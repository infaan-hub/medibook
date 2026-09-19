"""Cross-cutting views shared by the whole API (§24 — common)."""

import logging

from django.conf import settings
from django.db import DatabaseError, connection
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from common.responses import success_response

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    """Unauthenticated readiness probe: ``GET /api/health/``.

    Reports whether the API is up and whether the database is reachable, without
    exposing credentials, hosts or internal details (§36).
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request):
        database_status = "connected"
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except DatabaseError:
            database_status = "unavailable"
            logger.warning("Health check: database is unavailable")

        return success_response(
            message="MediBook API is running.",
            data={
                "service": "medibook-api",
                "version": settings.APP_VERSION,
                "database": database_status,
            },
        )

