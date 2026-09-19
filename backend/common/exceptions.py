"""DRF exception handler producing the MediBook error envelope (§28).

Registered through ``REST_FRAMEWORK["EXCEPTION_HANDLER"]``. Every API error the
client can trigger is converted to:

    {"success": false, "message": "...", "errors": {...}}

Unexpected (non-DRF) exceptions deliberately keep Django's 500 behaviour: their
details must never be exposed to clients (§35, §36).
"""

from typing import Any, Tuple

from rest_framework import status as http_status
from rest_framework.views import exception_handler as drf_exception_handler

DEFAULT_MESSAGES = {
    http_status.HTTP_400_BAD_REQUEST: "The request could not be processed.",
    http_status.HTTP_401_UNAUTHORIZED: (
        "Authentication credentials were not provided or are invalid."
    ),
    http_status.HTTP_403_FORBIDDEN: "You do not have permission to perform this action.",
    http_status.HTTP_404_NOT_FOUND: "The requested resource was not found.",
    http_status.HTTP_405_METHOD_NOT_ALLOWED: "This method is not allowed for this endpoint.",
    http_status.HTTP_409_CONFLICT: (
        "The request conflicts with the current state of the resource."
    ),
    http_status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: "The submitted data type is not supported.",
    http_status.HTTP_429_TOO_MANY_REQUESTS: "Too many requests. Please try again later.",
}


def _normalise(payload: Any, status_code: int) -> Tuple[str, Any]:
    """Split a DRF error payload into a human message plus field errors."""
    default_message = DEFAULT_MESSAGES.get(status_code, "The request failed.")

    # Most DRF exceptions carry {"detail": "..."} and nothing else.
    if isinstance(payload, dict):
        if set(payload.keys()) == {"detail"}:
            return str(payload["detail"]), {}
        return default_message, payload

    # A bare list means a non-field validation error.
    if isinstance(payload, list):
        return default_message, {"non_field_errors": payload}

    return str(payload), {}


def custom_exception_handler(exc, context):
    """Wrap DRF error responses in the standard MediBook envelope."""
    response = drf_exception_handler(exc, context)

    if response is None:
        # Not a DRF-handled exception: let Django return 500 without leaking detail.
        return None

    message, errors = _normalise(response.data, response.status_code)
    response.data = {
        "success": False,
        "message": message,
        "errors": errors,
    }
    return response
