"""Audit records for privileged platform actions."""

from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class AuditEvent(TimeStampedModel):
    """Immutable high-level record of an administrator action."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=80)
    target = models.CharField(max_length=160, blank=True, default="")
    detail = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
from django.db import models

# Create your models here.
