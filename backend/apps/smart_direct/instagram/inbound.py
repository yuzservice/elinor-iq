import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.smart_direct.models import (
    InstagramProcessedEvent,
    SmartDirectEvent,
    SmartDirectSession,
    TemporaryConversationContext,
)
from apps.smart_direct.services import (
    create_session,
    record_event,
    store_temporary_context,
    trim_recent_messages,
)

from . import MAX_STORED_TEXT_CHARS
from .parsing import extract_inbound_messages
from .runtime import record_webhook_result

logger = logging.getLogger(__name__)


def get_or_create_open_session(instagram_user_id):
    session = (
        SmartDirectSession.objects.filter(instagram_user_id=instagram_user_id)
        .exclude(status=SmartDirectSession.Status.CLOSED)
        .order_by("-last_activity_at", "-id")
        .first()
    )
    if session:
        return session, False
    return create_session(instagram_user_id=instagram_user_id), True


def append_recent_message(session, *, role, text):
    existing = []
    state = {}
    try:
        context = session.temporary_context
        existing = list(context.recent_messages or [])
        state = context.state if isinstance(context.state, dict) else {}
    except TemporaryConversationContext.DoesNotExist:
        pass
    existing.append(
        {
            "role": role,
            "text": (text or "")[:MAX_STORED_TEXT_CHARS],
            "at": timezone.now().isoformat(),
        }
    )
    return store_temporary_context(
        session,
        recent_messages=trim_recent_messages(existing),
        state=state,
    )


def handle_webhook_payload(payload):
    inbound = extract_inbound_messages(payload)
    processed = 0
    duplicates = 0
    skipped = 0
    for item in inbound:
        result = handle_inbound_message(item)
        if result == "processed":
            processed += 1
        elif result == "duplicate":
            duplicates += 1
        else:
            skipped += 1
    note = "messages"
    if processed:
        record_webhook_result(status="ok", note=note)
    elif duplicates and not processed:
        record_webhook_result(status="ok", note="duplicate")
    elif inbound:
        record_webhook_result(status="ok", note="skipped")
    else:
        record_webhook_result(status="ok", note="no_inbound")
    return {
        "processed": processed,
        "duplicates": duplicates,
        "skipped": skipped,
    }


def handle_inbound_message(item):
    if item.get("is_echo") or item.get("is_deleted"):
        return "skipped"
    mid = item["mid"]
    igsid = item["igsid"]
    try:
        with transaction.atomic():
            try:
                processed = InstagramProcessedEvent.objects.create(
                    external_id=mid,
                    kind=InstagramProcessedEvent.Kind.INBOUND_MESSAGE,
                )
            except IntegrityError:
                return "duplicate"
            session, _created = get_or_create_open_session(igsid)
            processed.session = session
            processed.save(update_fields=["session"])
            append_recent_message(session, role="customer", text=item.get("text") or "")
            record_event(
                session,
                SmartDirectEvent.EventType.CUSTOMER_MESSAGE_RECEIVED,
                metadata={"mid": mid},
            )
            return "processed"
    except Exception:
        logger.exception("Failed to process inbound Instagram message.")
        raise
