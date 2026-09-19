"""Specialty routes (§27)."""

from rest_framework.routers import DefaultRouter

from specialties.views import SpecialtyViewSet

app_name = "specialties"

router = DefaultRouter()
router.register("specialties", SpecialtyViewSet, basename="specialty")

urlpatterns = router.urls
