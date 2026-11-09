from django.conf import settings
from django.http import Http404
from rest_framework.permissions import BasePermission

from apps.accounts.models import User

# Roles that see Elinor Pulse. Add manager / analyst here when the owner decides.
PULSE_ROLES = frozenset({User.ROLE_SUPER_ADMIN, User.ROLE_ADMIN, User.ROLE_CONTENT})


def has_pulse_access(user):
    return bool(settings.PULSE_ENABLED and user and user.is_authenticated and user.role in PULSE_ROLES)


class PulseAccess(BasePermission):
    """404 while Pulse is off (the module is absent), 403 for roles outside PULSE_ROLES."""

    message = "به این بخش دسترسی ندارید."

    def has_permission(self, request, view):
        if not settings.PULSE_ENABLED:
            raise Http404
        return bool(request.user and request.user.is_authenticated and request.user.role in PULSE_ROLES)
