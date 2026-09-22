"""Blog / Health Tips API."""

from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsAdminRole
from blog.models import Article
from blog.serializers import (
    ArticleCreateUpdateSerializer,
    ArticleDetailSerializer,
    ArticleListSerializer,
)
from common.pagination import StandardResultsSetPagination
from common.responses import error_response, success_response


class ArticlePublicListView(APIView):
    """GET /api/blog/articles/ — published articles (public)."""

    permission_classes = (AllowAny,)
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        category = request.query_params.get("category")
        qs = Article.objects.filter(published=True).order_by("-published_at")
        if category:
            qs = qs.filter(category=category)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = ArticleListSerializer(page or qs, many=True)
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return success_response(data=serializer.data)


class ArticlePublicDetailView(APIView):
    """GET /api/blog/articles/{slug}/ — single published article (public)."""

    permission_classes = (AllowAny,)

    def get(self, request, slug: str):
        try:
            article = Article.objects.get(slug=slug, published=True)
        except Article.DoesNotExist:
            return error_response(
                message="Article not found.",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        return success_response(data=ArticleDetailSerializer(article).data)


class ArticleAdminViewSet(ModelViewSet):
    """Admin CRUD for blog articles."""

    pagination_class = StandardResultsSetPagination
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminRole()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ArticleCreateUpdateSerializer
        if self.action == "retrieve":
            return ArticleDetailSerializer
        return ArticleListSerializer

    def get_queryset(self):
        return Article.objects.all().order_by("-published_at", "-created_at")

    def perform_create(self, serializer):
        article = serializer.save(author=self.request.user)
        if article.published and not article.published_at:
            article.published_at = timezone.now()
            article.save(update_fields=["published_at"])

    def perform_update(self, serializer):
        article = serializer.save()
        if article.published and not article.published_at:
            article.published_at = timezone.now()
            article.save(update_fields=["published_at"])

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
        self.perform_create(serializer)
        return success_response(
            data=ArticleDetailSerializer(serializer.instance).data,
            message="Article created.",
            status_code=http_status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_response(
            data=ArticleDetailSerializer(serializer.instance).data,
            message="Article updated.",
        )

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)
