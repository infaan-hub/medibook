"""Review routes (§27)."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from reviews.views import (
    AppointmentReviewView,
    DoctorReviewListView,
    ReviewViewSet,
)

app_name = "reviews"

router = DefaultRouter()
router.register("reviews", ReviewViewSet, basename="review")

urlpatterns = [
    path(
        "appointments/<int:pk>/review/",
        AppointmentReviewView.as_view(),
        name="appointment-review",
    ),
    path(
        "doctors/<int:pk>/reviews/",
        DoctorReviewListView.as_view(),
        name="doctor-reviews",
    ),
] + router.urls
