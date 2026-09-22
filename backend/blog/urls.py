"""Blog routes."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from blog.views import ArticleAdminViewSet, ArticlePublicDetailView, ArticlePublicListView

app_name = "blog"

router = DefaultRouter()
router.register("admin/blog/articles", ArticleAdminViewSet, basename="blog-article")

urlpatterns = [
    path(
        "blog/articles/",
        ArticlePublicListView.as_view(),
        name="article-list",
    ),
    path(
        "blog/articles/<slug:slug>/",
        ArticlePublicDetailView.as_view(),
        name="article-detail",
    ),
] + router.urls
