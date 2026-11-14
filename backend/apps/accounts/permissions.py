from rest_framework.permissions import BasePermission

from .models import User


def is_super_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.role == User.ROLE_SUPER_ADMIN)


class IsSuperAdmin(BasePermission):
    message = "فقط سوپر ادمین به این بخش دسترسی دارد."

    def has_permission(self, request, view):
        return is_super_admin(request.user)


# Store map («فروشگاه»): design = super admin; edit = put products on racks; view = read-only map.
STORE_MAP_EDIT_ROLES = frozenset({User.ROLE_SUPER_ADMIN, User.ROLE_ADMIN, User.ROLE_MANAGER, User.ROLE_SALES_STAFF})
STORE_MAP_VIEW_ROLES = STORE_MAP_EDIT_ROLES | {User.ROLE_ANALYST, User.ROLE_STAFF, User.ROLE_STORE_STAFF}


def store_map_access(user):
    """"design", "edit", "view" or None for this user."""
    if not (user and user.is_authenticated):
        return None
    if user.role == User.ROLE_SUPER_ADMIN:
        return "design"
    if user.role in STORE_MAP_EDIT_ROLES:
        return "edit"
    return "view" if user.role in STORE_MAP_VIEW_ROLES else None
