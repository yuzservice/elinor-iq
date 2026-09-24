from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from .models import SmartDirectEvent, SmartDirectSession, TemporaryConversationContext

DEFAULT_CONTEXT_TTL_HOURS = 72
MAX_RECENT_MESSAGES = 20

STATUS_AFTER_EVENT = {
    SmartDirectEvent.EventType.PRODUCT_LINK_SENT: SmartDirectSession.Status.LINK_SENT,
    SmartDirectEvent.EventType.ADMIN_HANDOFF: SmartDirectSession.Status.ADMIN_HANDOFF,
    SmartDirectEvent.EventType.SESSION_CLOSED: SmartDirectSession.Status.CLOSED,
}

OUTCOME_AFTER_EVENT = {
    SmartDirectEvent.EventType.PRODUCT_LINK_SENT: "LINK_SENT",
    SmartDirectEvent.EventType.ADMIN_HANDOFF: "ADMIN_HANDOFF",
    SmartDirectEvent.EventType.SESSION_CLOSED: "CLOSED",
    SmartDirectEvent.EventType.PRODUCT_SELECTED: "PRODUCT_SELECTED",
}


def context_ttl():
    hours = int(getattr(settings, "SMART_DIRECT_CONTEXT_TTL_HOURS", DEFAULT_CONTEXT_TTL_HOURS))
    return timedelta(hours=hours)


def context_expiry(from_time=None):
    return (from_time or timezone.now()) + context_ttl()


def local_day_bounds(now=None):
    current = timezone.localtime(now or timezone.now())
    start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def trim_recent_messages(messages):
    if not isinstance(messages, list):
        return []
    return messages[-MAX_RECENT_MESSAGES:]


def create_session(*, instagram_user_id, external_conversation_id="", **summary_fields):
    now = timezone.now()
    session = SmartDirectSession.objects.create(
        instagram_user_id=instagram_user_id,
        external_conversation_id=external_conversation_id or "",
        started_at=now,
        last_activity_at=now,
        **summary_fields,
    )
    record_event(session, SmartDirectEvent.EventType.SESSION_STARTED, at=now)
    return session


def record_event(
    session,
    event_type,
    *,
    product_source_id=None,
    variant_source_id=None,
    metadata=None,
    at=None,
):
    now = at or timezone.now()
    event = SmartDirectEvent.objects.create(
        session=session,
        event_type=event_type,
        created_at=now,
        product_source_id=product_source_id,
        variant_source_id=variant_source_id,
        metadata=metadata or {},
    )
    update_fields = ["last_activity_at"]
    session.last_activity_at = now
    next_status = STATUS_AFTER_EVENT.get(event_type)
    if next_status:
        session.status = next_status
        update_fields.append("status")
        if next_status == SmartDirectSession.Status.CLOSED:
            session.closed_at = now
            update_fields.append("closed_at")
    next_outcome = OUTCOME_AFTER_EVENT.get(event_type)
    if next_outcome:
        session.outcome = next_outcome
        update_fields.append("outcome")
    session.save(update_fields=update_fields)
    TemporaryConversationContext.objects.filter(session=session).update(
        expires_at=context_expiry(now),
        updated_at=now,
    )
    return event


def store_temporary_context(session, *, recent_messages=None, state=None):
    now = timezone.now()
    session.last_activity_at = now
    session.save(update_fields=["last_activity_at"])
    payload = {
        "expires_at": context_expiry(now),
        "recent_messages": trim_recent_messages(recent_messages if recent_messages is not None else []),
        "state": state if isinstance(state, dict) else {},
    }
    context, created = TemporaryConversationContext.objects.get_or_create(
        session=session,
        defaults=payload,
    )
    if not created:
        if recent_messages is not None:
            context.recent_messages = payload["recent_messages"]
        if state is not None:
            context.state = payload["state"]
        context.expires_at = payload["expires_at"]
        context.save()
    return context


def delete_expired_temporary_context(now=None):
    now = now or timezone.now()
    deleted, _ = TemporaryConversationContext.objects.filter(expires_at__lte=now).delete()
    return deleted


def today_counts(now=None):
    start, end = local_day_bounds(now)
    day_events = SmartDirectEvent.objects.filter(created_at__gte=start, created_at__lt=end)
    event_counts = {
        row["event_type"]: row["total"]
        for row in day_events.values("event_type").annotate(total=Count("id"))
    }
    sessions_processed = (
        SmartDirectSession.objects.filter(
            Q(started_at__gte=start, started_at__lt=end)
            | Q(last_activity_at__gte=start, last_activity_at__lt=end)
        )
        .distinct()
        .count()
    )
    return {
        "sessions_processed": sessions_processed,
        "product_requests": event_counts.get(SmartDirectEvent.EventType.PRODUCT_REQUEST, 0),
        "links_sent": event_counts.get(SmartDirectEvent.EventType.PRODUCT_LINK_SENT, 0),
        "admin_handoffs": event_counts.get(SmartDirectEvent.EventType.ADMIN_HANDOFF, 0),
    }
