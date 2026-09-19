"""Standard API response envelope (§28).

Success:

    {"success": true,  "message": "...", "data": {...}}

Error:

    {"success": false, "message": "...", "errors": {...}}

Controllers should use these helpers instead of returning bare DRF responses, so
the frontend only ever has to handle one response shape.
"""

from typing import Any, Optional

from rest_framework import status as http_status
from rest_framework.response import Response


def success_response(
    data: Optional[Any] = None,
    message: str = "",
    status_code: int = http_status.HTTP_200_OK,
) -> Response:
    """Return a successful envelope response."""
    return Response(
        {
            "success": True,
            "message": message,
            "data": {} if data is None else data,
        },
        status=status_code,
    )


def error_response(
    message: str = "",
    errors: Optional[Any] = None,
    status_code: int = http_status.HTTP_400_BAD_REQUEST,
) -> Response:
    """Return an error envelope response."""
    return Response(
        {
            "success": False,
            "message": message,
            "errors": {} if errors is None else errors,
        },
        status=status_code,
    )
