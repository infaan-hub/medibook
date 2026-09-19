"""Hospital catalog API (§24 hospitals, §11 facility info)."""

from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsAdminRole
from common.pagination import StandardResultsSetPagination
from common.responses import success_response
from hospitals.models import Hospital
from hospitals.serializers import HospitalSerializer


class HospitalViewSet(ModelViewSet):
    """Public list/retrieve with city filter; admin-only write."""

    queryset = Hospital.objects.all()
    serializer_class = HospitalSerializer
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        city = self.request.query_params.get("city")
        if city:
            queryset = queryset.filter(city__icontains=city)
        return queryset

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
            message="Hospital created.",
            status_code=http_status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message="Hospital updated.")

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)

