"""Hospital admin (§24 hospitals)."""

from django.contrib import admin

from hospitals.models import Hospital


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = ("name", "city", "phone")
    list_filter = ("city",)
    search_fields = ("name", "city")

