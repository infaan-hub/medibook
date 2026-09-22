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

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health / readiness probe
    path("api/", include("common.urls")),
    # Authentication (§27, §29) — PHASE 3 custom user + JWT flows.
    path("api/", include("accounts.urls")),
    # Catalog + profiles + booking + notifications + reviews.
    path("api/", include("specialties.urls")),
    path("api/", include("hospitals.urls")),
    path("api/", include("patients.urls")),
    path("api/", include("doctors.urls")),
    path("api/", include("treatments.urls")),
    # Reviews before appointments: /api/appointments/{id}/review/ must not be
    # captured by the appointments action route (<str:action> pattern).
    path("api/", include("reviews.urls")),
    path("api/", include("appointments.urls")),
    path("api/", include("notifications.urls")),
    # Admin dashboard statistics (§34).
    path("api/", include("reports.urls")),
    # Blog / Health Tips (PHASE 1).
    path("api/", include("blog.urls")),
]

if settings.DEBUG:
    # Serve uploaded media in development only (§35, §70).
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
