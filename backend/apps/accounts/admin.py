from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

User = get_user_model()


class AppUserCreationForm(UserCreationForm):
    """Username, role and a password (entered twice, Django's validators apply)."""

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "role")


class AppUserChangeForm(UserChangeForm):
    """Password is shown hashed with Django's «change password» link; never editable as plain text."""

    class Meta(UserChangeForm.Meta):
        model = User
        fields = ("username", "role", "is_active")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = AppUserChangeForm
    add_form = AppUserCreationForm
    list_display = ("username", "role", "is_active", "last_login")
    list_filter = ("role", "is_active")
    search_fields = ("username",)
    ordering = ("username",)
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Role", {"fields": ("role", "is_active", "is_staff", "is_superuser")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("username", "role", "password1", "password2")}),)
    readonly_fields = ("last_login", "date_joined")
