from django.db.models import Count, Max, Q, Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.coverage import coverage_payload
from apps.sales.models import OrderItem


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_list(request):
    page = max(1, int(request.query_params.get("page") or 1))
    per_page = min(50, max(1, int(request.query_params.get("per_page") or 20)))
    search = (request.query_params.get("search") or "").strip()
    qs = (
        OrderItem.objects.filter(status=1)
        .values(
            "product_source_id",
            "variant_source_id",
            "product__title",
            "variant__title",
            "variant__name",
            "variant__color_name",
            "variant__size",
            "title",
        )
        .annotate(
            sold_quantity=Sum("quantity"),
            order_count=Count("order_id", distinct=True),
            last_sale_at=Max("order__created_at"),
        )
        .order_by("-sold_quantity", "-last_sale_at")
    )
    if search:
        qs = qs.filter(
            Q(product__title__icontains=search)
            | Q(variant__title__icontains=search)
            | Q(variant__name__icontains=search)
            | Q(variant__sku__icontains=search)
            | Q(title__icontains=search)
        )
    total = qs.count()
    start_idx = (page - 1) * per_page
    rows = list(qs[start_idx : start_idx + per_page])
    return Response(
        {
            "page": page,
            "per_page": per_page,
            "total": total,
            "data_coverage": coverage_payload(),
            "results": [_row_payload(row) for row in rows],
        }
    )


def _row_payload(row):
    variant_bits = [
        row.get("variant__title") or row.get("variant__name") or "",
        " / ".join(part for part in [row.get("variant__color_name"), row.get("variant__size")] if part),
    ]
    variant = " — ".join(bit for bit in variant_bits if bit) or "—"
    product = row.get("product__title") or row.get("title") or "—"
    return {
        "id": row.get("variant_source_id") or row.get("product_source_id") or 0,
        "product": product,
        "variant": variant,
        "sold_quantity": row.get("sold_quantity") or 0,
        "order_count": row.get("order_count") or 0,
        "last_sale_at": row.get("last_sale_at"),
    }
