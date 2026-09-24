import logging
from datetime import timedelta
from threading import Thread

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import User
from apps.accounts.permissions import IsSuperAdmin, is_super_admin
from apps.core.coverage import coverage_payload
from apps.customers.models import Customer
from apps.integrations.elinor.client import current_elinor_credentials
from apps.integrations.elinor.models import ElinorApiConfig, SyncRun
from apps.integrations.elinor.sync import POS_BRANCH_STORE_IDS, clear_stuck_sync_runs
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem, PosSale

logger = logging.getLogger(__name__)
POS_RANGE_MAX_DAYS = 60


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
    base_url, username, password = current_elinor_credentials()
    configured = bool(username and password)
    api_status = {"configured": configured}
    if is_super_admin(request.user):
        api_status.update(
            {
                "base_url": base_url,
                "username": username,
                "password_set": bool(password),
            }
        )
    return Response(
        {
            "api": api_status,
            "sync": {
                "running": running,
                "last_status": latest.status if latest else None,
                "last_started_at": latest.started_at if latest else None,
                "last_finished_at": latest.finished_at if latest else None,
                "last_success_at": success.finished_at if success else None,
                "window_start": (success or latest).window_start if (success or latest) else None,
                "window_end": (success or latest).window_end if (success or latest) else None,
                "error": _public_sync_error(latest.error_message if latest else ""),
                "job": _sync_job(latest),
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
    clear_stuck_sync_runs(minutes=3)
    if SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING).exists():
        return Response(
            {"detail": "یک همگام‌سازی هنوز در حال اجرا است. وضعیت همان کارت را ببینید."},
            status=status.HTTP_409_CONFLICT,
        )
    from_raw = str(request.data.get("from") or "").strip()
    to_raw = str(request.data.get("to") or "").strip()
    branches = request.data.get("branches") or []
    if not isinstance(branches, list):
        return Response({"detail": "شعبه نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
    branches = [str(branch) for branch in branches if str(branch) in POS_BRANCH_STORE_IDS]
    if bool(from_raw) ^ bool(to_raw):
        return Response({"detail": "هر دو تاریخ شروع و پایان لازم است."}, status=status.HTTP_400_BAD_REQUEST)
    if from_raw and to_raw:
        start = parse_date(from_raw)
        end = parse_date(to_raw)
        if not start or not end or start > end:
            return Response({"detail": "بازه تاریخ نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)
        if (end - start).days > POS_RANGE_MAX_DAYS:
            return Response({"detail": "بازه حداکثر ۶۰ روز است."}, status=status.HTTP_400_BAD_REQUEST)
        thread = Thread(target=_run_pos_range, args=(start, end, branches), daemon=True)
        thread.start()
        return Response({"ok": True, "message": "همگام‌سازی فروشگاه‌ها برای این بازه آغاز شد."})
    thread = Thread(target=_run_recent_sync, daemon=True)
    thread.start()
    return Response({"ok": True, "message": "همگام‌سازی آنلاین و فروشگاه آغاز شد."})


@api_view(["PUT"])
@permission_classes([IsSuperAdmin])
def api_config(request):
    base_url = (request.data.get("base_url") or "").strip().rstrip("/")
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if base_url and not base_url.startswith("https://"):
        return Response({"detail": "آدرس API باید با https:// شروع شود."}, status=status.HTTP_400_BAD_REQUEST)
    if not username:
        return Response({"detail": "نام کاربری API لازم است."}, status=status.HTTP_400_BAD_REQUEST)

    config, _created = ElinorApiConfig.objects.get_or_create(pk=1)
    if not password and not config.password and not settings.ELINOR_API_PASSWORD:
        return Response({"detail": "رمز API لازم است."}, status=status.HTTP_400_BAD_REQUEST)

    config.base_url = base_url or settings.ELINOR_API_BASE_URL.rstrip("/")
    config.username = username
    if password:
        config.password = password
    elif not config.password:
        config.password = settings.ELINOR_API_PASSWORD
    config.save()
    return Response({"ok": True, "username": config.username, "base_url": config.base_url, "password_set": True})


@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def admins(request):
    UserModel = get_user_model()
    if request.method == "GET":
        rows = UserModel.objects.order_by("username")
        return Response(
            {
                "results": [
                    {"id": user.id, "username": user.username, "role": user.role, "is_active": user.is_active}
                    for user in rows
                ]
            }
        )

    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if len(username) < 3:
        return Response({"detail": "نام کاربری حداقل ۳ حرف باشد."}, status=status.HTTP_400_BAD_REQUEST)
    if len(password) < 8:
        return Response({"detail": "رمز عبور حداقل ۸ حرف باشد."}, status=status.HTTP_400_BAD_REQUEST)
    if UserModel.objects.filter(username=username).exists():
        return Response({"detail": "این نام کاربری قبلاً ساخته شده است."}, status=status.HTTP_409_CONFLICT)

    user = UserModel.objects.create_user(
        username=username,
        password=password,
        role=User.ROLE_ADMIN,
        is_staff=False,
        is_superuser=False,
    )
    return Response(
        {"id": user.id, "username": user.username, "role": user.role},
        status=status.HTTP_201_CREATED,
    )


def _run_recent_sync():
    from apps.integrations.elinor.sync import SyncService
    from apps.integrations.elinor.models import SyncRun as Run

    close_old_connections()
    try:
        SyncService(Run.KIND_HOURLY).execute_hourly()
    except Exception:
        logger.exception("Panel hourly sync failed")
    finally:
        close_old_connections()


def _run_pos_range(start, end, branches):
    from apps.integrations.elinor.sync import SyncService
    from apps.integrations.elinor.models import SyncRun as Run

    close_old_connections()
    try:
        SyncService(Run.KIND_POS).execute_pos(start_date=start, end_date=end, branches=branches)
    except Exception:
        logger.exception("Panel POS range sync failed")
    finally:
        close_old_connections()


def _public_sync_error(error):
    if not error:
        return ""
    if "rate limits" in error:
        return "محدودیت درخواست API پر شد. همان بازه را دوباره بزنید تا از همان روز ادامه دهد."
    if error == "Cleared stuck sync run.":
        return "اجرای قبلی بدون پیشرفت مانده بود و بسته شد."
    return error


def _sync_job(run):
    if not run:
        return None
    report = run.report or {}
    heartbeat = parse_datetime(report.get("heartbeat") or "")
    beat = heartbeat or run.started_at
    stalled = run.status == SyncRun.STATUS_RUNNING and beat < timezone.now() - timedelta(minutes=3)
    labels = {
        SyncRun.STATUS_RUNNING: "در حال اجرا",
        SyncRun.STATUS_PAUSED: "متوقف شد",
        SyncRun.STATUS_FAILED: "ناموفق",
        SyncRun.STATUS_SUCCESS: "انجام شد",
    }
    return {
        "kind": run.kind,
        "status": run.status,
        "status_label": "بدون پیشرفت" if stalled else labels.get(run.status, run.status),
        "stalled": stalled,
        "error": _public_sync_error(run.error_message),
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "window_start": run.window_start,
        "window_end": run.window_end,
        "requests_made": run.requests_made,
        "current_day": report.get("current_day"),
        "pos_sales_upserted": report.get("pos_sales_upserted", 0),
        "failures": report.get("failures", 0),
        "branches": report.get("branches") or [],
    }
