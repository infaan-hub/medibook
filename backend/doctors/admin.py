"""Doctor admin (§24 doctors)."""

from django.contrib import admin

from doctors.models import Availability, Doctor


class AvailabilityInline(admin.TabularInline):
    model = Availability
    extra = 0


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = (
        "user", "experience_years", "consultation_fee",
        "is_available", "average_rating",
    )
    list_filter = ("is_available",)
    search_fields = ("user__email", "user__first_name", "user__last_name")
    inlines = (AvailabilityInline,)


@admin.register(Availability)
class AvailabilityAdmin(admin.ModelAdmin):
    list_display = ("doctor", "weekday", "start_time", "end_time", "is_active")
    list_filter = ("weekday", "is_active")

