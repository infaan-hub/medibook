"""Appointment admin (§24 appointments)."""

from django.contrib import admin

from appointments.models import Appointment


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = (
        "id", "doctor", "patient", "appointment_date", "start_time", "status",
    )
    list_filter = ("status", "appointment_date")
    search_fields = ("patient__email", "doctor__user__email")

