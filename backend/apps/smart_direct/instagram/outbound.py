from datetime import timedelta

from django.utils import timezone

from apps.smart_direct.models import (
    InstagramProcessedEvent,
    SmartDirectEvent,
    SmartDirectSession,
)
from apps.smart_direct.services import record_event

from . import INBOUND_WINDOW_HOURS, MAX_REPLY_CHARS
from .client import InstagramSendError, send_text_message
from .inbound import append_recent_message
from .runtime import record_send_result


class ReplyNotAllowed(Exception):
    pass


def send_manual_reply(session, text):
    body = (text or "").strip()
    if not body:
        raise ReplyNotAllowed("متن پاسخ خالی است.")
    if len(body) > MAX_REPLY_CHARS:
        raise ReplyNotAllowed("متن پاسخ بیش از حد بلند است.")
    if session.status == SmartDirectSession.Status.CLOSED:
        raise ReplyNotAllowed("این گفتگو بسته شده است.")
    last_inbound = (
        session.events.filter(event_type=SmartDirectEvent.EventType.CUSTOMER_MESSAGE_RECEIVED)
        .order_by("-created_at")
        .first()
    )
    if last_inbound is None:
        raise ReplyNotAllowed("فقط پس از پیام مشتری می‌توان پاسخ داد.")
    if last_inbound.created_at < timezone.now() - timedelta(hours=INBOUND_WINDOW_HOURS):
        raise ReplyNotAllowed("پنجره ۲۴ ساعته پاسخ به این گفتگو گذشته است.")
    try:
        result = send_text_message(session.instagram_user_id, body)
    except InstagramSendError as exc:
        record_send_result(ok=False, session_id=session.id, error=str(exc))
        raise
    message_id = result.get("message_id") or ""
    if message_id:
        InstagramProcessedEvent.objects.get_or_create(
            external_id=message_id,
            defaults={
                "kind": InstagramProcessedEvent.Kind.OUTBOUND_MESSAGE,
                "session": session,
            },
        )
    append_recent_message(session, role="admin", text=body)
    record_event(
        session,
        SmartDirectEvent.EventType.ADMIN_REPLY_SENT,
        metadata={"mid": message_id} if message_id else {},
    )
    record_send_result(ok=True, session_id=session.id, error="")
    return {"ok": True, "message_id": message_id, "session_id": session.id}
