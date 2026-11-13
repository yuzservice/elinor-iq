from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def home_summary(request):
    """Home page: period figures, today so far, branches, trend (cached 60 s) and role-filtered attention items."""
    from apps.core import home
    from apps.core.home_cache import cached, summary_key
    from apps.sales.targets import progress

    params = {key: request.query_params.get(key) for key in ("period", "from", "to", "compare", "line")}
    try:
        home.resolve_window(params)
    except ValueError:
        return Response({"detail": "بازه تاریخ نامعتبر است."}, status=400)
    data = cached(summary_key(params), lambda: home.summary(params))
    lines = home.parse_lines(params["line"])
    targets = cached(f"targets:month:{params['line']}", lambda: progress("month", lines=lines))
    facts = cached("attention", home.attention_facts)
    return Response({**data, "attention": home.attention(request.user, targets=targets, facts=facts)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def home_targets(request):
    """Target progress for the current Jalali month, season or year (?scope=month|quarter|year), cached 60 s."""
    from apps.core.home_cache import cached
    from apps.sales.targets import progress
    from apps.sales.views import can_edit_targets

    from apps.core.home import parse_lines

    scope = request.query_params.get("scope")
    scope = scope if scope in ("month", "quarter", "year") else "month"
    line = request.query_params.get("line")
    data = cached(f"targets:{scope}:{line}", lambda: progress(scope, lines=parse_lines(line)))
    return Response({**data, "can_edit": can_edit_targets(request.user)})
