from threading import Thread

from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.core.coverage import coverage_payload
from apps.customers.models import Customer
from apps.integrations.elinor.models import SyncRun
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem, PosSale


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def status_view(request):
    latest = SyncRun.objects.order_by("-started_at").first()
    success = SyncRun.objects.filter(status=SyncRun.STATUS_SUCCESS).order_by("-finished_at").first()
    running = SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING).exists()
    counts = {
        "orders": Order.objects.count(),
        "customers": Customer.objects.count(),
        "purchasing_customers": Customer.objects.purchasing().count(),
        "items": OrderItem.objects.count(),
        "pos_sales": PosSale.objects.count(),
        "products": Product.objects.count(),
        "variants": Variant.objects.count(),
    }
    configured = bool(settings.ELINOR_API_BASE_URL and settings.ELINOR_API_USERNAME)
    return Response(
        {
            "api": {
                "configured": configured,
                "base_url": settings.ELINOR_API_BASE_URL if configured else "",
                "username": settings.ELINOR_API_USERNAME if configured else "",
            },
            "sync": {
                "running": running,
                "last_status": latest.status if latest else None,
                "last_started_at": latest.started_at if latest else None,
                "last_finished_at": latest.finished_at if latest else None,
                "last_success_at": success.finished_at if success else None,
                "window_start": (success or latest).window_start if (success or latest) else None,
                "window_end": (success or latest).window_end if (success or latest) else None,
                "error": latest.error_message if latest else "",
            },
            "counts": counts,
            "data_coverage": coverage_payload(),
            "backup": {
                "available": False,
                "note": "پشتیبان‌گیری PostgreSQL در این نسخه فقط به‌صورت زیرساخت آماده شده است.",
            },
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def trigger_sync(request):
    if SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING).exists():
        return Response(
            {"detail": "همگام‌سازی در حال اجرا است."},
            status=status.HTTP_409_CONFLICT,
        )
    thread = Thread(target=_run_recent_sync, daemon=True)
    thread.start()
    return Response({"ok": True, "message": "همگام‌سازی آغاز شد."})


def _run_recent_sync():
    from apps.integrations.elinor.sync import SyncService
    from apps.integrations.elinor.models import SyncRun as Run

    try:
        SyncService(Run.KIND_RECENT).execute()
    except Exception:
        pass
