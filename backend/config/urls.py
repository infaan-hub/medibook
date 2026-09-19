"""Root URL configuration for the MediBook backend (§27 API Architecture).

Every API route is mounted under ``/api/``. App-specific routers are added in
their own phases:

    PHASE 3  accounts      /api/auth/*, /api/auth/me/
    PHASE 6  patients      /api/patients/profile/
    PHASE 7  doctors       /api/doctors/
    PHASE 8  specialties   /api/specialties/, /api/hospitals/
    PHASE 9  appointments  /api/doctors/{id}/availability/
    PHASE 10 appointments  /api/appointments/
    PHASE 13 notifications /api/notifications/
    PHASE 15 reviews       /api/appointments/{id}/review/
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health / readiness probe
    path("api/", include("common.urls")),
    # Authentication (§27, §29) — issued for the custom user model in PHASE 3.
    path("api/auth/login/", TokenObtainPairView.as_view(), name="auth-login"),
    path(
        "api/auth/token/refresh/",
        TokenRefreshView.as_view(),
        name="auth-token-refresh",
    ),
]

if settings.DEBUG:
    # Serve uploaded media in development only (§35, §70).
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
