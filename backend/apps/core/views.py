from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def home_summary(request):
    """Home page: period figures, today so far, branches, trend (cached 60 s) and role-filtered attention items."""
    from apps.core import home
    from apps.core.home_cache import cached
    from apps.sales.targets import progress

    params = {key: request.query_params.get(key) for key in ("period", "from", "to")}
    try:
        home.resolve_window(params)
    except ValueError:
        return Response({"detail": "بازه تاریخ نامعتبر است."}, status=400)
    key = f"summary:{params['period']}:{params['from']}:{params['to']}"
    data = cached(key, lambda: home.summary(params))
    targets = cached("targets:month", lambda: progress("month"))
    facts = cached("attention", home.attention_facts)
    return Response({**data, "attention": home.attention(request.user, targets=targets, facts=facts)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def home_targets(request):
    """Target progress for the current Jalali month, season or year (?scope=month|quarter|year), cached 60 s."""
    from apps.core.home_cache import cached
    from apps.sales.targets import progress
    from apps.sales.views import can_edit_targets

    scope = request.query_params.get("scope")
    scope = scope if scope in ("month", "quarter", "year") else "month"
    data = cached(f"targets:{scope}", lambda: progress(scope))
    return Response({**data, "can_edit": can_edit_targets(request.user)})
