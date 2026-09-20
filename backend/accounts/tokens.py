"""Single-use token helpers + JWT pair (§24 accounts, §29)."""

import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken


def reset_lifetime() -> int:
    return int(settings.PASSWORD_RESET_TOKEN_HOURS)


def issue_token(model_cls, user, lifetime_hours: int):
    """Issue a fresh single-use token; expire all older live tokens."""
    raw = secrets.token_urlsafe(48)
    obj = model_cls.objects.create(user=user, token=raw)
    model_cls.objects.filter(user=user, used_at__isnull=True).exclude(
        pk=obj.pk
    ).update(used_at=timezone.now())
    return obj


def token_is_expired(obj, lifetime_hours: int) -> bool:
    return obj.created_at < timezone.now() - timedelta(hours=lifetime_hours)


def jwt_pair_for(user) -> dict:
    """Access + refresh pair for an authenticated user."""
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def send_password_reset_email(user, raw_token: str) -> None:
    send_mail(
        subject="Reset your MediBook password",
        message=(
            f"Hello {user.get_short_name()},\n\n"
            "Use this code to reset your MediBook password:\n\n"
            f"{raw_token}\n\n"
            f"It expires in {settings.PASSWORD_RESET_TOKEN_HOURS} hours. "
            "If you did not request this, ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
