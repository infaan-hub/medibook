"""Authentication API views (Â§24 accounts, Â§27, Â§28, Â§29)."""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.models import EmailVerificationToken, PasswordResetToken, Role
from accounts.serializers import (
    LogoutSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    ResendVerificationSerializer,
    UserSerializer,
    UsernameLoginSerializer,
    VerifyEmailSerializer,
    user_payload,
)
from accounts.tokens import (
    issue_token,
    jwt_pair_for,
    reset_lifetime,
    send_password_reset_email,
    send_verification_email,
    token_is_expired,
    verification_lifetime,
)
from common.responses import error_response, success_response

User = get_user_model()


class RegisterView(APIView):
    """POST /api/auth/register/ — self-registration + JWT pair."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        if user.role == Role.DOCTOR:
            from doctors.models import Doctor
            Doctor.objects.get_or_create(user=user)
        token_obj = issue_token(
            EmailVerificationToken, user, verification_lifetime()
        )
        send_verification_email(user, token_obj.token)
        pair = jwt_pair_for(user)
        return success_response(
            data={"user": user_payload(user), **pair},
            message="Registration successful. Please verify your email address.",
            status_code=http_status.HTTP_201_CREATED,
        )


class UsernameLoginView(APIView):
    """POST /api/auth/login/ — username + password → JWT pair (§29)."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth"

    def post(self, request):
        serializer = UsernameLoginSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        pair = jwt_pair_for(user)
        return success_response(
            data={"user": user_payload(user), **pair},
            message="Login successful.",
        )


class RefreshView(TokenRefreshView):
    """POST /api/auth/token/refresh/ — rotate refresh token (§29)."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        return success_response(
            data=response.data, message="Token refreshed."
        )

class LogoutView(APIView):
    """POST /api/auth/logout/ â€” blacklist the refresh token."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except (TokenError, InvalidToken):
            return error_response(
                message="The refresh token is invalid or has expired.",
                errors={"refresh": ["The refresh token is invalid or has expired."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        return success_response(message="Logout successful.")



class PasswordChangeView(APIView):
    """POST /api/auth/password-change/ â€” authenticated password change."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(message="Password changed successfully.")


class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset/ — email the reset token (§27)."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = User.objects.normalize_email(
            serializer.validated_data["email"].strip().lower()
        )
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Never reveal whether the email exists (Â§36).
            return success_response(
                message="If an account exists for this email, a reset link was sent."
            )
        token_obj = issue_token(PasswordResetToken, user, reset_lifetime())
        send_password_reset_email(user, token_obj.token)
        return success_response(
            message="If an account exists for this email, a reset link was sent."
        )


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset-confirm/ â€” set a new password (Â§27)."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token_obj = PasswordResetToken.objects.select_related("user").get(
                token=serializer.validated_data["token"], used_at__isnull=True
            )
        except PasswordResetToken.DoesNotExist:
            return error_response(
                message="The reset token is invalid or has expired.",
                errors={"token": ["The reset token is invalid or has expired."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        if token_is_expired(token_obj, reset_lifetime()):
            token_obj.used_at = timezone.now()
            token_obj.save(update_fields=["used_at", "updated_at"])
            return error_response(
                message="The reset token is invalid or has expired.",
                errors={"token": ["The reset token is invalid or has expired."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        user = token_obj.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        token_obj.used_at = timezone.now()
        token_obj.save(update_fields=["used_at", "updated_at"])
        return success_response(message="Password reset successfully.")


class VerifyEmailView(APIView):
    """POST /api/auth/verify-email/ â€” confirm email ownership."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token_obj = EmailVerificationToken.objects.select_related("user").get(
                token=serializer.validated_data["token"], used_at__isnull=True
            )
        except EmailVerificationToken.DoesNotExist:
            return error_response(
                message="The verification token is invalid or has expired.",
                errors={"token": ["The verification token is invalid or has expired."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        if token_is_expired(token_obj, verification_lifetime()):
            token_obj.used_at = timezone.now()
            token_obj.save(update_fields=["used_at", "updated_at"])
            return error_response(
                message="The verification token is invalid or has expired.",
                errors={"token": ["The verification token is invalid or has expired."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        user = token_obj.user
        user.is_verified = True
        user.save(update_fields=["is_verified", "updated_at"])
        token_obj.used_at = timezone.now()
        token_obj.save(update_fields=["used_at", "updated_at"])
        return success_response(
            data={"user": user_payload(user)},
            message="Email verified successfully.",
        )


class ResendVerificationView(APIView):
    """POST /api/auth/resend-verification/ â€” re-send the verify email."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = User.objects.normalize_email(
            serializer.validated_data["email"].strip().lower()
        )
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Never reveal whether the email exists (Â§36).
            return success_response(
                message="If an account exists for this email, a verification email was sent."
            )
        if user.is_verified:
            return success_response(message="This email address is already verified.")
        token_obj = issue_token(
            EmailVerificationToken, user, verification_lifetime()
        )
        send_verification_email(user, token_obj.token)
        return success_response(
            message="If an account exists for this email, a verification email was sent."
        )


class MeView(RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/me/ â€” own profile (email/role read-only)."""

    serializer_class = UserSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        return success_response(
            data=self.get_serializer(self.get_object()).data
        )

    def patch(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message="Profile updated.")

    def put(self, request, *args, **kwargs):
        return self.patch(request, *args, **kwargs)


