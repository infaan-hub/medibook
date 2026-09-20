"""Role-based permissions enforced by the backend (§30)."""

from rest_framework.permissions import BasePermission


class IsPatient(BasePermission):
    """Only authenticated users with the patient role."""

    message = "This action is available to patients only."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) == "patient"
        )


class IsDoctor(BasePermission):
    """Only authenticated users with the doctor role."""

    message = "This action is available to doctors only."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(
            user and user.is_authenticated and getattr(user, "role", None) == "doctor"
        )


class IsAdminRole(BasePermission):
    """Only Django superusers — platform management (§30)."""

    message = "This action is available to administrators only."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return False
        return bool(user.is_superuser)

