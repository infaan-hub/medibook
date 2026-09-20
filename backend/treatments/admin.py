from django.contrib import admin

from treatments.models import MedicalTreatment


@admin.register(MedicalTreatment)
class MedicalTreatmentAdmin(admin.ModelAdmin):
    list_display = ("id", "doctor", "patient", "diagnosis", "created_at")
    list_filter = ("created_at",)
    search_fields = ("diagnosis", "treatment_notes")
