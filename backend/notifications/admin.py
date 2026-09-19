"""Notification admin (§24 notifications)."""

from django.contrib import admin

from notifications.models import Notification, PushSubscription


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "notification_type", "is_read", "created_at")
    list_filter = ("notification_type", "is_read")


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "is_active", "created_at")
    list_filter = ("is_active",)

