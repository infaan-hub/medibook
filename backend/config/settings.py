"""
Django settings for the MediBook backend.

PHASE 1 — Development Environment.

All secrets and environment-specific values are read from backend/.env, which is
never committed (see §35 Security Requirements and Rule 6 of the roadmap).
backend/.env.example documents every supported variable.
"""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env(name, default=None, required=False):
    """Read an environment variable, optionally failing fast when missing."""
    value = os.getenv(name, default)
    if required and not value:
        raise ImproperlyConfigured(
            f"Missing required environment variable: {name}. "
            f"Copy backend/.env.example to backend/.env and set it."
        )
    return value


def env_bool(name, default=False):
    return str(env(name, str(default))).strip().lower() in {"1", "true", "yes", "on"}


def env_int(name, default):
    try:
        return int(env(name, str(default)))
    except (TypeError, ValueError) as error:
        raise ImproperlyConfigured(f"{name} must be an integer.") from error


def env_list(name, default=""):
    return [item.strip() for item in str(env(name, default)).split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

# Reported by GET /api/health/ — kept in sync with frontend/package.json.
APP_VERSION = env("APP_VERSION", "0.1.0")

SECRET_KEY = env("DJANGO_SECRET_KEY", required=True)

DEBUG = env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    # MediBook apps (§23, §24, §50 PHASE 2 — registered as scaffolding;
    # business logic is added phase by phase)
    "common",
    "accounts",
    "patients",
    "doctors",
    "specialties",
    "hospitals",
    "appointments",
    "notifications",
    "reviews",
    "reports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Database — PostgreSQL (§25, §26)
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "medibook"),
        "USER": env("POSTGRES_USER", "medibook_user"),
        "PASSWORD": env("POSTGRES_PASSWORD", ""),
        "HOST": env("POSTGRES_HOST", "127.0.0.1"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": env_int("POSTGRES_CONN_MAX_AGE", 60),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Authentication (§29, §30)
# ---------------------------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# ---------------------------------------------------------------------------
# Django REST Framework (§28)
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": env_int("API_PAGE_SIZE", 20),
    # Every error response uses the MediBook envelope documented in §28.
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
    # Timezone-aware datetimes everywhere (USE_TZ = True).
    "DATETIME_FORMAT": "iso-8601",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_int("JWT_ACCESS_MINUTES", 30)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env_int("JWT_REFRESH_DAYS", 7)),
    "ROTATE_REFRESH_TOKENS": True,
    # Blacklisting gives logout/rotation real revocation power (§35).
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

# ---------------------------------------------------------------------------
# CORS — allows the React dev server and the deployed PWA origin
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Static and media files
# The React PWA build (manifest.json, service-worker.js, offline.html) is served
# by the frontend host from the application root, not from Django static files
# (§22.3, §70).
# ---------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# Internationalization — slot times are stored in UTC (Phase 0 decision #8)
# ---------------------------------------------------------------------------

LANGUAGE_CODE = env("DJANGO_LANGUAGE_CODE", "en-us")
TIME_ZONE = env("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Email — configurable backend + token lifetimes (PHASE 3, decision #9)
# ---------------------------------------------------------------------------

EMAIL_BACKEND = env(
    "DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = env("DJANGO_EMAIL_HOST", "")
EMAIL_PORT = env_int("DJANGO_EMAIL_PORT", 587)
EMAIL_HOST_USER = env("DJANGO_EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("DJANGO_EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("DJANGO_EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = env(
    "DJANGO_DEFAULT_FROM_EMAIL", "MediBook <no-reply@medibook.local>"
)
# Single-use token lifetimes (hours).
EMAIL_VERIFICATION_TOKEN_HOURS = env_int("EMAIL_VERIFICATION_TOKEN_HOURS", 24)
PASSWORD_RESET_TOKEN_HOURS = env_int("PASSWORD_RESET_TOKEN_HOURS", 2)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "[{levelname}] {asctime} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": env("DJANGO_LOG_LEVEL", "INFO"),
    },
}

# ---------------------------------------------------------------------------
# Production security baseline (§35, reviewed again in PHASE 17)
# ---------------------------------------------------------------------------

if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = env_int("DJANGO_SECURE_HSTS_SECONDS", 31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")