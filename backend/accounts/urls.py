"""Auth routes mounted under /api/auth/ (§27)."""

from django.urls import path

from accounts.views import (
    EmailLoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    RegisterView,
    ResendVerificationView,
    VerifyEmailView,
)

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", EmailLoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/token/refresh/", RefreshView.as_view(), name="token-refresh"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/password-change/", PasswordChangeView.as_view(), name="password-change"),
    path(
        "auth/password-reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset",
    ),
    path(
        "auth/password-reset-confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("auth/verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path(
        "auth/resend-verification/",
        ResendVerificationView.as_view(),
        name="resend-verification",
    ),
]
