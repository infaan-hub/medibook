"""
Security headers middleware — PHASE 17.

Adds Content-Security-Policy, Referrer-Policy, Permissions-Policy,
and X-Content-Type-Options to every HTTP response.
"""

import os

from django.http import HttpRequest, HttpResponse


class SecurityHeadersMiddleware:
    """Injects security headers into every response."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)

        # Content-Security-Policy — restrictive default for a SPA API.
        # 'self' for scripts/styles; blob: for service worker; data: for inline images.
        response.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'",
        )

        # Prevent browsers from MIME-sniffing the response content type.
        response.setdefault("X-Content-Type-Options", "nosniff")

        # Control referrer information sent with requests.
        response.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")

        # Restrict browser features (camera, microphone, geolocation, etc.).
        response.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )

        # Prevent clickjacking (reinforces XFrameOptionsMiddleware).
        response.setdefault("X-Frame-Options", "DENY")

        return response
