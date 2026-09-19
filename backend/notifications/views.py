"""Notification inbox API (§24 notifications, §27, §31)."""

from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from common.pagination import StandardResultsSetPagination
from common.responses import success_response
from notifications.models import Notification, PushSubscription
from notifications.serializers import (
    NotificationSerializer,
    PushSubscriptionSerializer,
)


class NotificationViewSet(ModelViewSet):
    """Own inbox: list/retrieve/mark-read; no client-side creation."""

    serializer_class = NotificationSerializer
    pagination_class = StandardResultsSetPagination
    http_method_names = ("get", "patch", "delete", "head", "options")

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = Notification.objects.filter(
            recipient=self.request.user
        ).order_by("-created_at")
        unread = self.request.query_params.get("unread")
        if unread in ("1", "true", "yes"):
            queryset = queryset.filter(is_read=False)
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page or queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return success_response(data=serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_response(
            data=self.get_serializer(self.get_object()).data
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message="Notification updated.")

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class PushSubscriptionViewSet(ModelViewSet):
    """Device push subscriptions (§31 storage; delivery in PHASE 13)."""

    serializer_class = PushSubscriptionSerializer
    pagination_class = StandardResultsSetPagination
    http_method_names = ("get", "post", "delete", "head", "options")

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        return PushSubscription.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page or queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return success_response(data=serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return success_response(
            data=serializer.data,
            message="Push subscription saved.",
            status_code=http_status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)

