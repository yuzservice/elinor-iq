from django.conf import settings
from django.utils import timezone

from apps.smart_direct.instagram import GRAPH_INSTAGRAM_HOST, REQUIRED_SCOPES, WEBHOOK_PATH
from apps.smart_direct.instagram.client import instagram_api_version, instagram_is_configured
from apps.smart_direct.instagram.runtime import get_runtime_state
from apps.smart_direct.models import (
    SmartDirectEvent,
    SmartDirectSession,
    TemporaryConversationContext,
)

STATUS_LABELS = {
    SmartDirectSession.Status.ACTIVE: "فعال",
    SmartDirectSession.Status.LINK_SENT: "لینک ارسال‌شده",
    SmartDirectSession.Status.ADMIN_HANDOFF: "ارجاع به ادمین",
    SmartDirectSession.Status.CLOSED: "بسته",
}

OUTCOME_LABELS = {
    "LINK_SENT": "لینک خرید ارسال شد",
    "ADMIN_HANDOFF": "ارجاع به ادمین",
    "CLOSED": "بسته شد",
    "PRODUCT_SELECTED": "محصول انتخاب شد",
    "PRODUCT_SUGGESTED": "محصول پیشنهاد شد",
}


def build_connections():
    configured = instagram_is_configured()
    return [
        {
            "key": "instagram",
            "label": "اتصال اینستاگرام",
            "state": "configured" if configured else "disconnected",
            "state_label": "پیکربندی شده" if configured else "هنوز متصل نشده",
        },
        {
            "key": "catalog",
            "label": "کاتالوگ الینور",
            "state": "ready",
            "state_label": "آماده اتصال",
        },
        {
            "key": "ai_advisor",
            "label": "مشاور هوشمند",
            "state": "inactive",
            "state_label": "غیرفعال",
        },
    ]


def status_label(status):
    return STATUS_LABELS.get(status, status or "—")


def outcome_label(outcome):
    if not outcome:
        return "—"
    return OUTCOME_LABELS.get(outcome, outcome)


def selected_product_label(session):
    if session.selected_product_source_id:
        if session.selected_variant_source_id:
            return f"شناسه {session.selected_product_source_id} / تنوع {session.selected_variant_source_id}"
        return f"شناسه {session.selected_product_source_id}"
    return ""


def session_summary_payload(session):
    return {
        "id": session.id,
        "started_at": session.started_at,
        "last_activity_at": session.last_activity_at,
        "closed_at": session.closed_at,
        "status": session.status,
        "status_label": status_label(session.status),
        "request_summary": session.request_summary or "",
        "detected_product_type": session.detected_product_type or "",
        "detected_color": session.detected_color or "",
        "detected_size": session.detected_size or "",
        "detected_budget_min": session.detected_budget_min,
        "detected_budget_max": session.detected_budget_max,
        "selected_product_source_id": session.selected_product_source_id,
        "selected_variant_source_id": session.selected_variant_source_id,
        "selected_product_label": selected_product_label(session),
        "outcome": session.outcome or "",
        "outcome_label": outcome_label(session.outcome),
    }


def event_payload(event):
    return {
        "id": event.id,
        "event_type": event.event_type,
        "created_at": event.created_at,
        "product_source_id": event.product_source_id,
        "variant_source_id": event.variant_source_id,
        "metadata": event.metadata or {},
    }


def session_detail_payload(session):
    payload = session_summary_payload(session)
    payload.update(
        {
            "instagram_user_id": session.instagram_user_id,
            "external_conversation_id": session.external_conversation_id,
            "events": [event_payload(event) for event in session.events.all().order_by("created_at", "id")],
        }
    )
    return payload


def instagram_status_payload():
    runtime = get_runtime_state()
    verify_configured = bool(getattr(settings, "INSTAGRAM_VERIFY_TOKEN", ""))
    signature_configured = bool(getattr(settings, "INSTAGRAM_APP_SECRET", ""))
    webhook_ready = verify_configured and signature_configured
    last_status = runtime.last_webhook_status or "none"
    if webhook_ready and last_status == "none":
        webhook_label = "آماده دریافت"
    elif last_status == "ok":
        webhook_label = "رویداد دریافت شد"
    elif last_status == "invalid_signature":
        webhook_label = "امضای نامعتبر"
    elif last_status == "error":
        webhook_label = "خطای پردازش"
    elif webhook_ready:
        webhook_label = "پیکربندی شده"
    else:
        webhook_label = "پیکربندی نشده"
    return {
        "configured": instagram_is_configured(),
        "account_id": getattr(settings, "INSTAGRAM_ACCOUNT_ID", "") or "",
        "api_version": instagram_api_version(),
        "graph_host": GRAPH_INSTAGRAM_HOST,
        "scopes": list(REQUIRED_SCOPES),
        "webhook": {
            "url_path": WEBHOOK_PATH,
            "verify_token_configured": verify_configured,
            "signature_configured": signature_configured,
            "ready": webhook_ready,
            "last_received_at": runtime.last_webhook_at,
            "last_status": last_status,
            "last_note": runtime.last_webhook_note,
            "status_label": webhook_label,
        },
        "last_send": {
            "at": runtime.last_send_at,
            "ok": runtime.last_send_ok,
            "error": runtime.last_send_error,
            "session_id": runtime.last_send_session_id,
        },
    }


def debug_session_payload():
    now = timezone.now()
    context = (
        TemporaryConversationContext.objects.select_related("session")
        .filter(expires_at__gt=now)
        .exclude(session__status=SmartDirectSession.Status.CLOSED)
        .order_by("-updated_at")
        .first()
    )
    if context is None:
        return None
    session = context.session
    can_reply = session.events.filter(
        event_type=SmartDirectEvent.EventType.CUSTOMER_MESSAGE_RECEIVED
    ).exists()
    return {
        "id": session.id,
        "instagram_user_id": session.instagram_user_id,
        "status": session.status,
        "status_label": status_label(session.status),
        "last_activity_at": session.last_activity_at,
        "expires_at": context.expires_at,
        "can_reply": can_reply,
        "recent_messages": context.recent_messages or [],
    }
