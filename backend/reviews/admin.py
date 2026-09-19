"""Review admin (§24 reviews)."""

from django.contrib import admin

from reviews.models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("appointment", "doctor", "patient", "rating", "is_visible")
    list_filter = ("rating", "is_visible")

