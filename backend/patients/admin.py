"""Patient profile admin (§24 patients)."""

from django.contrib import admin

from patients.models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("user", "city", "gender", "created_at")
    search_fields = ("user__email", "city")

