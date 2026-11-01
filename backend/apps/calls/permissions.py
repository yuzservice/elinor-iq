from rest_framework.permissions import BasePermission

from apps.accounts.models import User

MANAGER_ROLES = (User.ROLE_SUPER_ADMIN, User.ROLE_ADMIN, User.ROLE_MANAGER)


def is_call_manager(user):
    return bool(user and user.is_authenticated and user.role in MANAGER_ROLES)


def is_call_user(user):
    return is_call_manager(user) or bool(user and user.is_authenticated and user.role == User.ROLE_SALES_AGENT)


class IsCallManager(BasePermission):
    message = "این بخش فقط برای مدیران است."

    def has_permission(self, request, view):
        return is_call_manager(request.user)


class IsCallUser(BasePermission):
    message = "به مرکز تماس دسترسی ندارید."

    def has_permission(self, request, view):
        return is_call_user(request.user)
