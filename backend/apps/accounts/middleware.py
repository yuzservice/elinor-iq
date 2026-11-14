"""sales_agent sees only the Call Center and Customer 360 of customers assigned to them; content sees only Elinor Pulse;
store_staff sees only the store map (read-only); sales_staff never reaches settings. Enforced here for every API."""

import re

from django.http import JsonResponse

from .models import User

_ALLOWED = ("/api/auth/", "/api/calls/", "/api/health/")
_CUSTOMER_360 = re.compile(r"^/api/customers/(\d+)/(?:purchases/|products/|timeline/)?$")
_TIERS = "/api/customers/tiers/"
_CONTENT_ALLOWED = ("/api/auth/", "/api/health/", "/api/pulse/")
_STORE_STAFF_ALLOWED = ("/api/auth/", "/api/health/")
_STORE_MAP_READ = "/api/store-map/layout/"
_SALES_STAFF_BLOCKED = ("/api/system/", "/admin/")
_DENIED = "به این بخش دسترسی ندارید."


class SalesAgentScopeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            if user.role == User.ROLE_SALES_AGENT and not self._allowed(request):
                return JsonResponse({"detail": _DENIED}, status=403)
            if user.role == User.ROLE_CONTENT and request.path.startswith(("/api/", "/admin/")) and not request.path.startswith(_CONTENT_ALLOWED):
                return JsonResponse({"detail": _DENIED}, status=403)
            if user.role == User.ROLE_STORE_STAFF and not self._store_staff_allowed(request):
                return JsonResponse({"detail": _DENIED}, status=403)
            if user.role == User.ROLE_SALES_STAFF and request.path.startswith(_SALES_STAFF_BLOCKED):
                return JsonResponse({"detail": _DENIED}, status=403)
        return self.get_response(request)

    @staticmethod
    def _store_staff_allowed(request):
        path = request.path
        if not path.startswith(("/api/", "/admin/")) or path.startswith(_STORE_STAFF_ALLOWED):
            return True
        return request.method == "GET" and path.startswith(_STORE_MAP_READ)

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
