from django.contrib import admin
from django.contrib.auth import get_user_model

User = get_user_model()


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "role", "is_active", "last_login")
    search_fields = ("username",)
    exclude = ("password",)
