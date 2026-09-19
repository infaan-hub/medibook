"""Specialty catalog API (§24 specialties)."""

from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsAdminRole
from common.pagination import StandardResultsSetPagination
from common.responses import success_response
from specialties.models import Specialty
from specialties.serializers import SpecialtySerializer


class SpecialtyViewSet(ModelViewSet):
    """Public list/retrieve; admin-only write (§20 search/filter)."""

    queryset = Specialty.objects.all()
    serializer_class = SpecialtySerializer
    pagination_class = StandardResultsSetPagination
    lookup_field = "pk"

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAuthenticated(), IsAdminRole()]

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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=serializer.data,
            message="Specialty created.",
            status_code=http_status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message="Specialty updated.")

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)

