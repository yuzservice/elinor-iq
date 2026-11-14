"""`/api/store-map/`: every endpoint checks the role here; `accounts/middleware.py` also limits store_staff to GET layout."""

from django.core.paginator import Paginator
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.permissions import store_map_access
from apps.products.models import Product, ProductMetrics
from apps.sales.models import SalesLine
from apps.sales.semantics import visible_sales_lines

from .codes import HIDDEN_STATUSES, search_filter
from .errors import Blocked, Conflict, Invalid
from .layout import layout_payload, product_cards, rack_slots, save_layout, set_slot_product
from .models import Rack, StoreLayout
from .templates import delete_template, live_parts, save_template, template_payload

DENIED = Response({"detail": "به این بخش دسترسی ندارید."}, status=status.HTTP_403_FORBIDDEN)
CONFLICT = "نقشه در این فاصله در جای دیگری ذخیره شده است. صفحه را دوباره بارگیری کنید تا آخرین نسخه را ببینید؛ تغییرهای ذخیره‌نشده شما اعمال نمی‌شود."
ACCESS_ORDER = {"view": 1, "edit": 2, "design": 3}


def _allowed(request, level):
    return ACCESS_ORDER.get(store_map_access(request.user), 0) >= ACCESS_ORDER[level]


def _branch(request):
    """Store branches only (never ONLINE or a hidden line); SARI by default."""
    branch = request.query_params.get("branch") or (request.data.get("branch") if request.method in ("PUT", "POST") else None) or SalesLine.SARI
    stores = [line for line in visible_sales_lines() if line != SalesLine.ONLINE]
    return branch if branch in stores else None


@api_view(["GET", "PUT"])
def layout(request):
    if not _allowed(request, "design" if request.method == "PUT" else "view"):
        return DENIED
    branch = _branch(request)
    if branch is None:
        return Response({"detail": "شعبه نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
    if request.method == "GET":
        found = StoreLayout.objects.select_related("updated_by").filter(branch=branch).first()
        return Response({"branch": branch, "access": store_map_access(request.user), "layout": layout_payload(found)})
    try:
        saved, created = save_layout(branch, request.data, request.user)
    except (Conflict, Blocked, Invalid) as error:
        return _error(branch, error)
    return Response({"version": saved.version, "updated_at": saved.updated_at, "created": created})


def _error(branch, error):
    if isinstance(error, Conflict):
        current = StoreLayout.objects.filter(branch=branch).values_list("version", flat=True).first()
        return Response({"detail": CONFLICT, "code": "version_conflict", "version": current}, status=status.HTTP_409_CONFLICT)
    if isinstance(error, Blocked):
        return Response({"detail": str(error), "code": "blocked"}, status=status.HTTP_409_CONFLICT)
    return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)


def _template_result(layout, template, ids):
    """The saved template, the new layout version, and the slots of every rack built from it (they may have changed)."""
    pieces, arms = live_parts([template])
    racks = list(Rack.objects.filter(template=template, deleted_at__isnull=True).order_by("id"))
    slots = rack_slots(racks)
    return {
        "version": layout.version,
        "ids": ids,
        "template": template_payload(template, pieces.get(template.id, []), arms.get(template.id, []), len(racks)),
        "racks": [{"id": r.id, "slots": slots.get(r.id, [])} for r in racks],
    }


@api_view(["POST"])
def templates(request):
    """Create a rack template (super admin); body: version, kind (line/hub), name and its pieces or arms."""
    if not _allowed(request, "design"):
        return DENIED
    branch = _branch(request)
    if branch is None:
        return Response({"detail": "شعبه نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        layout, template, ids = save_template(branch, None, request.data, request.user)
    except (Conflict, Blocked, Invalid) as error:
        return _error(branch, error)
    return Response(_template_result(layout, template, ids), status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
def template(request, template_id):
    """Save (PUT, syncs every rack of the template) or delete (DELETE ?version=, refused while racks use it)."""
    if not _allowed(request, "design"):
        return DENIED
    branch = _branch(request)
    if branch is None:
        return Response({"detail": "شعبه نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        if request.method == "DELETE":
            raw = request.query_params.get("version")
            layout = delete_template(branch, template_id, int(raw) if raw and raw.isdigit() else None, request.user)
            return Response({"version": layout.version})
        layout, saved, ids = save_template(branch, template_id, request.data, request.user)
    except (Conflict, Blocked, Invalid) as error:
        return _error(branch, error)
    return Response(_template_result(layout, saved, ids))


@api_view(["PATCH"])
def slot_product(request, slot_id):
    if not _allowed(request, "edit"):
        return DENIED
    product_id = request.data.get("product_id")
    if product_id is not None:
        if isinstance(product_id, bool) or not isinstance(product_id, int):
            return Response({"detail": "کالا نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
        if not Product.objects.filter(id=product_id).exclude(status__in=HIDDEN_STATUSES).exists():
            return Response({"detail": "این کالا پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    payload = set_slot_product(slot_id, product_id, request.user)
    if payload is None:
        return Response({"detail": "این جایگاه دیگر روی نقشه نیست؛ صفحه را دوباره بارگیری کنید."}, status=status.HTTP_404_NOT_FOUND)
    return Response(payload)


@api_view(["GET"])
def products(request):
    """Popup search: active local products by title or number (Persian or Latin digits), newest first; with no query,
    the 200 most recently sold products."""
    if not _allowed(request, "edit"):
        return DENIED
    rows = Product.objects.exclude(status__in=HIDDEN_STATUSES).filter(search_filter(request.query_params.get("q")))
    recent = ProductMetrics.objects.filter(last_sale_date__isnull=False).order_by("-last_sale_date").values_list("product_id", flat=True)
    ordered = rows.order_by("-id") if request.query_params.get("q") else rows.filter(id__in=recent[:200]).order_by("-id")
    page = Paginator(ordered.values_list("id", flat=True), 20).get_page(request.query_params.get("page") or 1)
    cards = product_cards(list(page.object_list))
    return Response({
        "results": [cards[pid] for pid in page.object_list if pid in cards],
        "page": page.number,
        "pages": page.paginator.num_pages,
        "count": page.paginator.count,
    })
