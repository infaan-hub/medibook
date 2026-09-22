from django.contrib import admin

from blog.models import Article


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "published", "published_at", "author")
    list_filter = ("published", "category")
    search_fields = ("title", "content")
    prepopulated_fields = {"slug": ("title",)}
