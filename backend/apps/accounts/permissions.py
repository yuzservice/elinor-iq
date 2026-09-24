from rest_framework.permissions import BasePermission

from .models import User


def is_super_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.role == User.ROLE_SUPER_ADMIN)


class IsSuperAdmin(BasePermission):
    message = "فقط سوپر ادمین به این بخش دسترسی دارد."

    def has_permission(self, request, view):
        return is_super_admin(request.user)
