from datetime import timedelta

import pytest
from django.apps import apps
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.smart_direct.models import (
    SmartDirectEvent,
    SmartDirectSession,
    TemporaryConversationContext,
)
from apps.smart_direct.services import (
    context_expiry,
    create_session,
    delete_expired_temporary_context,
    record_event,
    store_temporary_context,
    today_counts,
    trim_recent_messages,
)


def _private_context_markers():
    return ["secret-chat-body", "recent_messages", "temporary_context"]


@pytest.mark.django_db
def test_create_smart_direct_session():
    session = create_session(
        instagram_user_id="ig-1001",
        external_conversation_id="conv-55",
        request_summary="دنبال مانتو مشکی سایز ۳۶",
        detected_product_type="مانتو",
        detected_color="مشکی",
        detected_size="36",
        detected_budget_min=2000000,
        detected_budget_max=4000000,
    )
    session.refresh_from_db()
    assert session.status == SmartDirectSession.Status.ACTIVE
    assert session.instagram_user_id == "ig-1001"
    assert session.external_conversation_id == "conv-55"
    assert session.request_summary.startswith("دنبال مانتو")
    assert session.detected_color == "مشکی"
    assert session.closed_at is None
    assert session.events.filter(event_type=SmartDirectEvent.EventType.SESSION_STARTED).count() == 1


@pytest.mark.django_db
def test_event_creation_updates_session_outcome():
    session = create_session(instagram_user_id="ig-2002")
    event = record_event(
        session,
        SmartDirectEvent.EventType.PRODUCT_LINK_SENT,
        product_source_id=91,
        variant_source_id=440,
        metadata={"source": "advisor"},
    )
    session.refresh_from_db()
    assert event.product_source_id == 91
    assert event.variant_source_id == 440
    assert session.status == SmartDirectSession.Status.LINK_SENT
    assert session.outcome == "LINK_SENT"
    assert session.events.filter(event_type=SmartDirectEvent.EventType.PRODUCT_LINK_SENT).exists()


@pytest.mark.django_db
def test_temporary_context_stores_trimmed_recent_messages_only():
    session = create_session(instagram_user_id="ig-3003")
    messages = [{"role": "user", "text": f"msg-{index}"} for index in range(25)]
    context = store_temporary_context(
        session,
        recent_messages=messages,
        state={"awaiting": "size"},
    )
    context.refresh_from_db()
    assert len(context.recent_messages) == 20
    assert context.recent_messages[0]["text"] == "msg-5"
    assert context.state == {"awaiting": "size"}
    assert context.expires_at > timezone.now()
    assert trim_recent_messages("not-a-list") == []


@pytest.mark.django_db
def test_cleanup_expired_context_keeps_sessions_and_events():
    session = create_session(instagram_user_id="ig-4004")
    record_event(session, SmartDirectEvent.EventType.PRODUCT_REQUEST)
    live = store_temporary_context(session, recent_messages=[{"text": "keep-me"}])
    expired_session = create_session(instagram_user_id="ig-4005")
    expired = store_temporary_context(expired_session, recent_messages=[{"text": "drop-me"}])
    TemporaryConversationContext.objects.filter(pk=expired.pk).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )

    call_command("cleanup_smart_direct_context")

    assert TemporaryConversationContext.objects.filter(pk=live.pk).exists()
    assert not TemporaryConversationContext.objects.filter(pk=expired.pk).exists()
    assert SmartDirectSession.objects.count() == 2
    assert SmartDirectEvent.objects.count() == 3
    assert expired_session.request_summary == ""
    assert delete_expired_temporary_context() == 0


@pytest.mark.django_db
def test_session_summary_counts_today_events():
    now = timezone.now()
    session = create_session(instagram_user_id="ig-5005")
    session.started_at = now
    session.last_activity_at = now
    session.save(update_fields=["started_at", "last_activity_at"])
    record_event(session, SmartDirectEvent.EventType.PRODUCT_REQUEST, at=now)
    record_event(session, SmartDirectEvent.EventType.PRODUCT_LINK_SENT, at=now)
    record_event(session, SmartDirectEvent.EventType.ADMIN_HANDOFF, at=now)
    old = create_session(instagram_user_id="ig-old")
    SmartDirectEvent.objects.filter(session=old).update(created_at=now - timedelta(days=2))
    old.started_at = now - timedelta(days=2)
    old.last_activity_at = now - timedelta(days=2)
    old.save(update_fields=["started_at", "last_activity_at"])

    counts = today_counts(now)
    assert counts["sessions_processed"] == 1
    assert counts["product_requests"] == 1
    assert counts["links_sent"] == 1
    assert counts["admin_handoffs"] == 1


@pytest.mark.django_db
def test_smart_direct_apis_require_auth_and_hide_temporary_context(auth_api, settings):
    guest = APIClient()
    denied = guest.get("/api/smart-direct/summary/")
    assert denied.status_code in (401, 403)
    assert guest.get("/api/smart-direct/sessions/").status_code in (401, 403)

    settings.INSTAGRAM_ACCESS_TOKEN = "secret-token-value"
    empty = auth_api.get("/api/smart-direct/summary/")
    assert empty.status_code == 200
    assert empty.data["today"]["sessions_processed"] == 0
    assert empty.data["recent_outcomes"] == []
    assert empty.data["connections"][0]["state_label"] == "هنوز متصل نشده"
    assert empty.data["connections"][1]["state_label"] == "آماده اتصال"
    assert empty.data["connections"][2]["state_label"] == "غیرفعال"
    assert b"secret-token-value" not in empty.content
    assert b"recent_messages" not in empty.content

    session = create_session(
        instagram_user_id="ig-6006",
        request_summary="کت کرم",
        selected_product_source_id=12,
        selected_variant_source_id=88,
    )
    store_temporary_context(
        session,
        recent_messages=[{"text": "secret-chat-body"}],
        state={"private": True},
    )
    record_event(session, SmartDirectEvent.EventType.PRODUCT_SELECTED, product_source_id=12)

    summary = auth_api.get("/api/smart-direct/summary/")
    listing = auth_api.get("/api/smart-direct/sessions/")
    detail = auth_api.get(f"/api/smart-direct/sessions/{session.id}/")
    assert summary.status_code == listing.status_code == detail.status_code == 200
    assert listing.data["total"] == 1
    assert listing.data["results"][0]["request_summary"] == "کت کرم"
    assert listing.data["results"][0]["selected_product_label"] == "شناسه 12 / تنوع 88"
    assert "instagram_user_id" not in listing.data["results"][0]
    assert detail.data["instagram_user_id"] == "ig-6006"
    assert detail.data["events"]
    for marker in _private_context_markers():
        assert marker.encode() not in summary.content
        assert marker.encode() not in listing.content
        if marker != "recent_messages":
            assert marker.encode() not in detail.content
    assert b"secret-chat-body" not in detail.content
    assert "recent_messages" not in detail.data
    assert "temporary_context" not in detail.data
    assert "state" not in detail.data
    missing = auth_api.get("/api/smart-direct/sessions/999999/")
    assert missing.status_code == 404


def test_no_permanent_message_model():
    config = apps.get_app_config("smart_direct")
    names = {model.__name__ for model in config.get_models()}
    assert names == {
        "SmartDirectSession",
        "SmartDirectEvent",
        "TemporaryConversationContext",
        "InstagramProcessedEvent",
        "SmartDirectRuntimeState",
    }
    assert "Message" not in names
    for model in apps.get_models():
        if model._meta.app_label == "smart_direct":
            assert model.__name__ != "Message"
            assert "message" not in model._meta.db_table or model.__name__ == "TemporaryConversationContext"


def test_context_expiry_defaults_to_seventy_two_hours():
    now = timezone.now()
    assert context_expiry(now) - now == timedelta(hours=72)
