"""Notification routes (§27)."""

from rest_framework.routers import DefaultRouter

from notifications.views import NotificationViewSet, PushSubscriptionViewSet

app_name = "notifications"

router = DefaultRouter()
router.register("notifications", NotificationViewSet, basename="notification")
router.register(
    "notifications/push-subscriptions",
    PushSubscriptionViewSet,
    basename="push-subscription",
)

urlpatterns = router.urls
