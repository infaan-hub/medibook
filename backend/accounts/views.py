"""Authentication API views (Â§24 accounts, Â§27, Â§28, Â§29)."""

import json
import logging
import urllib.request
import urllib.error
from io import BytesIO

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.models import PasswordResetToken, Role
from accounts.serializers import (
    LogoutSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
    UsernameLoginSerializer,
    user_payload,
)
from accounts.tokens import (
    issue_token,
    jwt_pair_for,
    reset_lifetime,
    send_password_reset_email,
    token_is_expired,
)
from common.responses import error_response, success_response

logger = logging.getLogger(__name__)

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
        pair = jwt_pair_for(user)
        return success_response(
            data={"user": user_payload(user, request), **pair},
            message="Registration successful.",
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
            data={"user": user_payload(user, request), **pair},
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


class SocialLoginView(APIView):
    """POST /api/auth/social/ — Google or Apple OAuth login.

    Accepts ``provider`` ("google" | "apple") and ``token`` (the OAuth
    ID token / credential).  Verifies the token, creates or retrieves
    the user, and returns the standard JWT pair + user payload.
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth"

    PROVIDERS = ("google", "apple")

    def post(self, request):
        provider = (request.data.get("provider") or "").strip().lower()
        token = (request.data.get("token") or "").strip()

        if provider not in self.PROVIDERS:
            return error_response(
                message=f"Invalid provider. Must be one of: {', '.join(self.PROVIDERS)}.",
                errors={"provider": [f"Invalid provider '{provider}'."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )
        if not token:
            return error_response(
                message="Token is required.",
                errors={"token": ["This field is required."]},
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )

        try:
            if provider == "google":
                user_info = self._verify_google(token)
            else:
                user_info = self._verify_apple(token)
        except ValueError as exc:
            return error_response(
                message=str(exc),
                status_code=http_status.HTTP_401_UNAUTHORIZED,
            )

        email = user_info.get("email")
        if not email:
            return error_response(
                message="Could not retrieve email from OAuth provider.",
                status_code=http_status.HTTP_401_UNAUTHORIZED,
            )

        user, created = User.objects.get_or_create(
            email__iexact=email,
            defaults={
                "email": email,
                "username": email.split("@")[0],
                "first_name": user_info.get("first_name", ""),
                "last_name": user_info.get("last_name", ""),
                "role": Role.PATIENT,
            },
        )

        if created:
            # Ensure username is unique
            base_username = user.username
            counter = 1
            while User.objects.filter(username=user.username).exclude(pk=user.pk).exists():
                user.username = f"{base_username}{counter}"
                counter += 1
            user.save(update_fields=["username"])

            # Create doctor profile if needed
            if user.role == Role.DOCTOR:
                from doctors.models import Doctor
                Doctor.objects.get_or_create(user=user)

        # Download and save profile picture if provided and user doesn't have one
        picture_url = user_info.get("picture")
        if picture_url and not user.profile_image:
            self._save_profile_image(user, picture_url)

        pair = jwt_pair_for(user)
        return success_response(
            data={"user": user_payload(user, request), **pair},
            message="Social login successful.",
        )

    @staticmethod
    def _verify_google(token: str) -> dict:
        """Verify a Google ID token via the tokeninfo endpoint."""
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 401):
                raise ValueError("Invalid or expired Google token.") from exc
            raise ValueError("Could not verify Google token.") from exc
        except Exception as exc:
            raise ValueError("Could not verify Google token.") from exc

        email = data.get("email")
        if not email:
            raise ValueError("Google token does not contain an email.")
        return {
            "email": email,
            "first_name": data.get("given_name", ""),
            "last_name": data.get("family_name", ""),
            "picture": data.get("picture"),
        }

    @staticmethod
    def _verify_apple(token: str) -> dict:
        """Verify an Apple identity token (JWT)."""
        import jwt as pyjwt

        # Apple's public keys endpoint
        url = "https://appleid.apple.com/auth/keys"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                keys_data = json.loads(resp.read().decode())
        except Exception as exc:
            raise ValueError("Could not fetch Apple signing keys.") from exc

        # Decode header to get kid
        try:
            header = pyjwt.get_unverified_header(token)
        except Exception as exc:
            raise ValueError("Invalid Apple token format.") from exc

        kid = header.get("kid")
        if not kid:
            raise ValueError("Apple token missing kid header.")

        # Find matching key
        from jwt.algorithms import RSAAlgorithm
        public_key = None
        for key in keys_data.get("keys", []):
            if key.get("kid") == kid:
                public_key = RSAAlgorithm.from_jwk(key)
                break
        if not public_key:
            raise ValueError("No matching Apple signing key found.")

        try:
            payload = pyjwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                audience=settings.APPLE_CLIENT_ID,
                issuer="https://appleid.apple.com",
            )
        except pyjwt.ExpiredSignatureError:
            raise ValueError("Apple token has expired.")
        except pyjwt.InvalidTokenError as exc:
            raise ValueError(f"Invalid Apple token: {exc}") from exc

        email = payload.get("email")
        if not email:
            raise ValueError("Apple token does not contain an email.")
        return {
            "email": email,
            "first_name": payload.get("given_name", ""),
            "last_name": payload.get("family_name", ""),
            "picture": None,  # Apple doesn't provide profile pictures in the token
        }

    @staticmethod
    def _save_profile_image(user, url: str) -> None:
        """Download an image from *url* and save it as the user's profile_image."""
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MediBook/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                content = resp.read()
            ext = ".jpg"
            if "png" in resp.headers.get("Content-Type", ""):
                ext = ".png"
            elif "webp" in resp.headers.get("Content-Type", ""):
                ext = ".webp"
            filename = f"profile_{user.pk}{ext}"
            user.profile_image.save(filename, ContentFile(content), save=False)
            user.save(update_fields=["profile_image", "updated_at"])
        except Exception:
            logger.warning("Failed to download profile image from %s for user %s", url, user.pk)


