from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def category_tree(request):
    """Shared category tree (active categories only) for every category selector."""
    from apps.products.categories import tree

    return Response({"results": tree()})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def products_summary(request):
    """Products page: range, the four cards and the branch strip (summary tables only)."""
    from apps.products.report import products_summary as build

    return Response(build(request.query_params))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def products_table(request):
    """Products page table: top 10 by revenue, or the full sorted, paged list once a filter is set."""
    from apps.products.report import products_table as build

    return Response(build(request.query_params))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_pairs(request):
    """Co-purchase pairs (product or category level, by channel) for the range."""
    from apps.products.report import bundles

    return Response(bundles(request.query_params))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_detail(request, product_id):
    """Product 360 from the summary tables, with rule-based suggestions and buyers."""
    from apps.products.product360 import product_detail as build

    data = build(product_id, request.query_params)
    return Response(data) if data else Response({"detail": "کالا پیدا نشد."}, status=404)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def product_call_list(request, product_id):
    """Create a call list (buyers or prospects) and a draft program through the call center's list path."""
    from apps.calls.permissions import is_call_manager
    from apps.products.product360 import create_call_list

    if not is_call_manager(request.user):
        return Response({"detail": "فقط مدیر مرکز تماس می‌تواند لیست تماس بسازد."}, status=403)
    kind = request.data.get("kind")
    if kind not in ("buyers", "prospects"):
        return Response({"detail": "نوع لیست نامعتبر است."}, status=400)
    created = create_call_list(request.user, product_id, kind)
    if created is None:
        return Response({"detail": "مشتری مستعدی برای این کالا پیدا نشد."}, status=400)
    return Response(created, status=201)
