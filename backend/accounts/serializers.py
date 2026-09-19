"""Serializers for the MediBook authentication API (§27, §28, §29)."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.models import Role

User = get_user_model()


def user_payload(user) -> dict:
    """Public user dict shared by auth responses."""
    image = getattr(user, "profile_image", None)
    return {
        "id": user.pk,
        "username": user.username,
        "email": user.email,
        "phone": user.phone,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "profile_image": image.url if image else None,
        "is_verified": user.is_verified,
        "date_joined": user.created_at.isoformat() if hasattr(user, "created_at") and user.created_at else None,
    }


class UserSerializer(serializers.ModelSerializer):
    """Public user representation returned by ``/api/auth/me/``."""

    profile_image = serializers.ImageField(required=False, allow_null=True)
    date_joined = serializers.SerializerMethodField()

    def get_date_joined(self, obj) -> str | None:
        if hasattr(obj, "created_at") and obj.created_at:
            return obj.created_at.isoformat()
        return None

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "phone", "first_name", "last_name",
            "role", "profile_image", "is_verified", "date_joined",
        )
        read_only_fields = ("id", "username", "email", "role", "is_verified")


class RegisterSerializer(serializers.ModelSerializer):
    """Patient (or doctor, when permitted) self-registration."""

    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    password_confirm = serializers.CharField(
        write_only=True, min_length=8, max_length=128
    )

    class Meta:
        model = User
        fields = (
            "username", "email", "password", "password_confirm", "phone",
            "first_name", "last_name", "role",
        )
        extra_kwargs = {
            "phone": {"required": False},
            "first_name": {"required": False},
            "last_name": {"required": False},
            "role": {"required": False},
        }

    def validate_username(self, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Username must be at least 3 characters.")
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value: str) -> str:
        return User.objects.normalize_email(value.strip().lower())

    def validate_role(self, value: str) -> str:
        # Admins are created by staff, never by self-registration (§30).
        if value == Role.ADMIN:
            raise serializers.ValidationError(
                "Admin accounts cannot be created by self-registration."
            )
        return value

    def validate(self, attrs: dict) -> dict:
        if attrs.get("password") != attrs.get("password_confirm"):
            raise serializers.ValidationError(
                {"password_confirm": ["The two passwords do not match."]}
            )
        try:
            validate_password(attrs["password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"password": list(exc.messages)}
            ) from exc
        return attrs

    def create(self, validated_data: dict):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.full_clean(exclude={"password"})
        user.save()
        return user


class UsernameLoginSerializer(serializers.Serializer):
    """Username + password login — issues JWT pair on success (§29)."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs: dict) -> dict:
        from django.contrib.auth import authenticate

        user = authenticate(
            self.context.get("request"), username=attrs["username"].strip(), password=attrs["password"]
        )
        if user is None:
            raise serializers.ValidationError(
                "The username or password is incorrect."
            )
        if not user.is_active:
            raise serializers.ValidationError("This account has been deactivated.")
        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    """Refresh-token blacklist logout."""

    refresh = serializers.CharField()


class PasswordChangeSerializer(serializers.Serializer):
    """Authenticated password change (old + new password)."""

    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True, min_length=8, max_length=128
    )
    new_password_confirm = serializers.CharField(
        write_only=True, min_length=8, max_length=128
    )

    def validate(self, attrs: dict) -> dict:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError("Authentication is required.")
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError(
                {"old_password": ["The current password is incorrect."]}
            )
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": ["The two passwords do not match."]}
            )
        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"new_password": list(exc.messages)}
            ) from exc
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])


class PasswordResetRequestSerializer(serializers.Serializer):
    """Request a password-reset email (never reveals whether email exists)."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Confirm a password reset with the single-use token."""

    token = serializers.CharField(max_length=128)
    new_password = serializers.CharField(
        write_only=True, min_length=8, max_length=128
    )
    new_password_confirm = serializers.CharField(
        write_only=True, min_length=8, max_length=128
    )

    def validate(self, attrs: dict) -> dict:
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": ["The two passwords do not match."]}
            )
        try:
            validate_password(attrs["new_password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"new_password": list(exc.messages)}
            ) from exc
        return attrs


class VerifyEmailSerializer(serializers.Serializer):
    """Confirm email ownership with the single-use token."""

    token = serializers.CharField(max_length=128)


class ResendVerificationSerializer(serializers.Serializer):
    """Re-send the verification email (never reveals whether email exists)."""

    email = serializers.EmailField()


