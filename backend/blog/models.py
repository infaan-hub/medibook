"""Blog / Health Tips articles (admin-published)."""

from django.conf import settings
from django.db import models
from django.utils.text import slugify

from common.models import TimeStampedModel


class Article(TimeStampedModel):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, db_index=True)
    excerpt = models.TextField(blank=True, default="")
    content = models.TextField()
    image = models.ImageField(upload_to="blog/", blank=True, null=True)
    category = models.CharField(
        max_length=40,
        choices=[
            ("health_tips", "Health Tips"),
            ("wellness", "Wellness"),
            ("nutrition", "Nutrition"),
            ("mental_health", "Mental Health"),
            ("fitness", "Fitness"),
            ("general", "General"),
        ],
        default="general",
        db_index=True,
    )
    published = models.BooleanField(default=False, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="blog_articles",
    )

    class Meta:
        ordering = ("-published_at", "-created_at")

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)
            base = self.slug
            counter = 1
            while Article.objects.filter(slug=self.slug).exclude(pk=self.pk).exists():
                self.slug = f"{base}-{counter}"
                counter += 1
        super().save(*args, **kwargs)
