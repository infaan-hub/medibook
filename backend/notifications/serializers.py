"""Notification serializers (§24 notifications, §31)."""

from rest_framework import serializers

from notifications.models import Notification, PushSubscription


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id", "notification_type", "title", "message",
            "related_appointment", "is_read", "created_at",
        )
        read_only_fields = (
            "notification_type", "title", "message",
            "related_appointment", "created_at",
        )


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = (
            "id", "endpoint", "p256dh_key", "auth_key",
            "fcm_token", "device_info", "is_active",
        )
