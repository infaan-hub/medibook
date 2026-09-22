"""Blog article serializers."""

from rest_framework import serializers

from blog.models import Article


class ArticleListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = (
            "id", "title", "slug", "excerpt", "image",
            "category", "published_at", "created_at",
        )
        read_only_fields = fields


class ArticleDetailSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = (
            "id", "title", "slug", "excerpt", "content", "image",
            "category", "published", "published_at", "author",
            "author_name", "created_at", "updated_at",
        )
        read_only_fields = ("id", "author", "published_at", "created_at", "updated_at")

    def get_author_name(self, obj: Article) -> str:
        if obj.author:
            full = obj.author.get_full_name().strip()
            return full or obj.author.email
        return ""


class ArticleCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = (
            "id", "title", "slug", "excerpt", "content", "image",
            "category", "published",
        )
        read_only_fields = ("id",)
