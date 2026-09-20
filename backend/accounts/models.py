"""Custom user model and role definitions (§24 accounts, §26 User, §30)."""

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models

from common.models import TimeStampedModel

PHONE_VALIDATOR = RegexValidator(
    regex=r"^\+?[0-9]{7,15}$",
    message="Enter a valid phone number (7-15 digits, optional leading +).",
)


class Role(models.TextChoices):
    """Platform roles enforced by the backend (§30)."""

    PATIENT = "patient", "Patient"
    DOCTOR = "doctor", "Doctor"
    ADMIN = "admin", "Admin"


class UserManager(BaseUserManager):
    """Manager for the username-login custom user model."""

    def _create_user(self, username, email, password, **extra_fields):
        if not username:
            raise ValueError("A username is required.")
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.full_clean(exclude={"password"})
        user.save(using=self._db)
        return user

    def create_user(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(username, email, password, **extra_fields)

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", Role.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(username, email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """MediBook user — username login, role-based access (§26 User table)."""

    username = models.CharField(max_length=60, unique=True, db_index=True, default="")
    email = models.EmailField(unique=True, db_index=True)
    phone = models.CharField(
        max_length=16, blank=True, default="", validators=[PHONE_VALIDATOR]
    )
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    role = models.CharField(
        max_length=10, choices=Role.choices, default=Role.PATIENT, db_index=True
    )
    profile_image = models.ImageField(
        upload_to="profile_images/", blank=True, null=True
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS: list[str] = ["email"]

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.username

    # -- Role helpers used by permission classes (§30) ---------------------
    @property
    def is_patient(self) -> bool:
        return self.role == Role.PATIENT

    @property
    def is_doctor(self) -> bool:
        return self.role == Role.DOCTOR

    @property
    def is_admin_role(self) -> bool:
        return self.role == Role.ADMIN or self.is_superuser

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self) -> str:
        return self.first_name or self.email


class PasswordResetToken(TimeStampedModel):
    """Single-use token authorising a password change for a user."""

    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="password_tokens"
    )
    token = models.CharField(max_length=128, unique=True, db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"reset:{self.user_id}"


