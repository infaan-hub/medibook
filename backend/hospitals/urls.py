"""Hospital routes (§27)."""

from rest_framework.routers import DefaultRouter

from hospitals.views import HospitalViewSet

app_name = "hospitals"

router = DefaultRouter()
router.register("hospitals", HospitalViewSet, basename="hospital")

urlpatterns = router.urls
