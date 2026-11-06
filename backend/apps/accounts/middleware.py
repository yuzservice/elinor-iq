"""sales_agent sees only the Call Center and Customer 360 of customers assigned to them; content sees only Elinor Pulse.
Enforced here for every API."""

import re

from django.http import JsonResponse

from .models import User

_ALLOWED = ("/api/auth/", "/api/calls/", "/api/health/")
_CUSTOMER_360 = re.compile(r"^/api/customers/(\d+)/(?:purchases/|products/|timeline/)?$")
_TIERS = "/api/customers/tiers/"
_CONTENT_ALLOWED = ("/api/auth/", "/api/health/", "/api/pulse/")


class SalesAgentScopeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            if user.role == User.ROLE_SALES_AGENT and not self._allowed(request):
                return JsonResponse({"detail": "به این بخش دسترسی ندارید."}, status=403)
            if user.role == User.ROLE_CONTENT and request.path.startswith(("/api/", "/admin/")) and not request.path.startswith(_CONTENT_ALLOWED):
                return JsonResponse({"detail": "به این بخش دسترسی ندارید."}, status=403)
        return self.get_response(request)

    def _allowed(self, request):
        path = request.path
        if not path.startswith(("/api/", "/admin/")):
            return True
        if path.startswith(_ALLOWED):
            return True
        if request.method != "GET":
            return False
        if path == _TIERS:
            return True
        match = _CUSTOMER_360.match(path)
        if not match:
            return False
        from apps.calls.models import CallTask

        return CallTask.objects.filter(assignee=request.user, customer__source_id=int(match.group(1))).exists()
