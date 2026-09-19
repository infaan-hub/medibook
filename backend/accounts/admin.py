"""Custom user admin: email login, roles, verification (§24 accounts)."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from accounts.models import EmailVerificationToken, PasswordResetToken, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        "username", "email", "role", "first_name", "last_name",
        "is_verified", "is_active", "is_staff",
    )
    list_filter = ("role", "is_verified", "is_active", "is_staff")
    search_fields = ("username", "email", "first_name", "last_name", "phone")
    ordering = ("-created_at",)
    fieldsets = (
        (None, {"fields": ("username", "email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone", "profile_image")}),
        ("Roles & status", {"fields": ("role", "is_verified", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("username", "email", "password1", "password2", "role", "is_verified"),
        }),
    )


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "used_at", "created_at")
    search_fields = ("user__email",)
    readonly_fields = ("token", "created_at", "updated_at")


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "used_at", "created_at")
    search_fields = ("user__email",)
    readonly_fields = ("token", "created_at", "updated_at")

