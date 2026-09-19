"""Reusable abstract models shared across MediBook apps (§24 — common).

Only cross-cutting model behaviour belongs here. Domain models live in their own
apps (patients, doctors, appointments, ...).
"""

from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base model adding ``created_at`` and ``updated_at``.

    Every MediBook table that stores mutable records should inherit from this
    model so timestamp handling stays consistent (§26).
    """

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

