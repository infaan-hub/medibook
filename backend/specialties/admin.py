"""Specialty admin (§24 specialties)."""

from django.contrib import admin

from specialties.models import Specialty


@admin.register(Specialty)
class SpecialtyAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)

