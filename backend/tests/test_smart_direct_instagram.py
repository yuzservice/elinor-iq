import json
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.test import Client
from django.utils import timezone
from rest_framework.test import APIClient

from apps.smart_direct.instagram.inbound import handle_webhook_payload
from apps.smart_direct.instagram.parsing import extract_inbound_messages
from apps.smart_direct.instagram.signature import expected_signature
from apps.smart_direct.models import (
    InstagramProcessedEvent,
    SmartDirectEvent,
    SmartDirectSession,
    TemporaryConversationContext,
)
from apps.smart_direct.services import create_session, store_temporary_context


def _payload(igsid="ig-user-1", mid="mid-1", text="سلام", echo=False, deleted=False):
    message = {"mid": mid, "text": text}
    if echo:
        message["is_echo"] = True
    if deleted:
        message["is_deleted"] = True
    return {
        "object": "instagram",
        "entry": [
            {
                "id": "ig-account",
                "messaging": [
                    {
                        "sender": {"id": igsid},
                        "recipient": {"id": "ig-account"},
                        "timestamp": 1710000000000,
                        "message": message,
                    }
                ],
            }
        ],
    }


def _signed_post(settings, payload, signature=None):
    body = json.dumps(payload).encode("utf-8")
    sig = signature or expected_signature(settings.INSTAGRAM_APP_SECRET, body)
    client = Client()
    return client.post(
        "/api/smart-direct/instagram/webhook/",
        data=body,
        content_type="application/json",
        HTTP_X_HUB_SIGNATURE_256=f"sha256={sig}",
    )


@pytest.fixture
def instagram_settings(settings):
    settings.INSTAGRAM_APP_ID = "app-1"
    settings.INSTAGRAM_APP_SECRET = "test-secret"
    settings.INSTAGRAM_ACCESS_TOKEN = "EAA_test_token"
    settings.INSTAGRAM_ACCOUNT_ID = "17841400000"
    settings.INSTAGRAM_VERIFY_TOKEN = "verify-me"
    settings.INSTAGRAM_API_VERSION = "v25.0"
    return settings


def test_webhook_verification(instagram_settings):
    client = Client()
    ok = client.get(
        "/api/smart-direct/instagram/webhook/",
        {
            "hub.mode": "subscribe",
            "hub.verify_token": "verify-me",
            "hub.challenge": "1158201444",
        },
    )
    assert ok.status_code == 200
    assert ok.content == b"1158201444"


def test_invalid_webhook_verification(instagram_settings):
    client = Client()
    bad = client.get(
        "/api/smart-direct/instagram/webhook/",
        {
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong",
            "hub.challenge": "1158201444",
        },
    )
    assert bad.status_code == 403
    assert b"1158201444" not in bad.content


def test_incoming_event_parsing():
    parsed = extract_inbound_messages(_payload(text="کت کرم"))
    assert len(parsed) == 1
    assert parsed[0]["igsid"] == "ig-user-1"
    assert parsed[0]["mid"] == "mid-1"
    assert parsed[0]["text"] == "کت کرم"
    assert parsed[0]["is_echo"] is False


@pytest.mark.django_db
def test_incoming_creates_session_and_temporary_context(instagram_settings):
    response = _signed_post(instagram_settings, _payload(text="دنبال مانتو"))
    assert response.status_code == 200
    session = SmartDirectSession.objects.get(instagram_user_id="ig-user-1")
    assert session.status == SmartDirectSession.Status.ACTIVE
    context = TemporaryConversationContext.objects.get(session=session)
    assert context.recent_messages[-1]["text"] == "دنبال مانتو"
    assert context.recent_messages[-1]["role"] == "customer"
    assert session.events.filter(event_type=SmartDirectEvent.EventType.SESSION_STARTED).exists()
    assert session.events.filter(event_type=SmartDirectEvent.EventType.CUSTOMER_MESSAGE_RECEIVED).exists()
    event = session.events.get(event_type=SmartDirectEvent.EventType.CUSTOMER_MESSAGE_RECEIVED)
    assert event.metadata == {"mid": "mid-1"}
    assert "دنبال مانتو" not in json.dumps(event.metadata)


@pytest.mark.django_db
def test_session_reuse_for_same_instagram_user(instagram_settings):
    _signed_post(instagram_settings, _payload(mid="mid-a", text="اول"))
    _signed_post(instagram_settings, _payload(mid="mid-b", text="دوم"))
    assert SmartDirectSession.objects.filter(instagram_user_id="ig-user-1").count() == 1
    context = TemporaryConversationContext.objects.get(session__instagram_user_id="ig-user-1")
    assert [row["text"] for row in context.recent_messages] == ["اول", "دوم"]


@pytest.mark.django_db
def test_webhook_deduplication(instagram_settings):
    first = _signed_post(instagram_settings, _payload(mid="mid-dup", text="یک‌بار"))
    second = _signed_post(instagram_settings, _payload(mid="mid-dup", text="یک‌بار"))
    assert first.status_code == second.status_code == 200
    assert InstagramProcessedEvent.objects.filter(external_id="mid-dup").count() == 1
    assert SmartDirectEvent.objects.filter(event_type=SmartDirectEvent.EventType.CUSTOMER_MESSAGE_RECEIVED).count() == 1
    context = TemporaryConversationContext.objects.get()
    assert [row["text"] for row in context.recent_messages] == ["یک‌بار"]


@pytest.mark.django_db
def test_invalid_signature_is_rejected(instagram_settings):
    response = _signed_post(instagram_settings, _payload(), signature="deadbeef")
    assert response.status_code == 403
    assert SmartDirectSession.objects.count() == 0


@pytest.mark.django_db
def test_echo_messages_are_skipped(instagram_settings):
    response = _signed_post(instagram_settings, _payload(echo=True, text="echo"))
    assert response.status_code == 200
    assert SmartDirectSession.objects.count() == 0


@pytest.mark.django_db
def test_handle_payload_skips_deleted_messages():
    result = handle_webhook_payload(_payload(deleted=True, text="gone"))
    assert result["skipped"] == 1
    assert SmartDirectSession.objects.count() == 0


@pytest.mark.django_db
@patch("apps.smart_direct.instagram.client.requests.post")
def test_manual_send_service_uses_graph_instagram(mock_post, auth_api, instagram_settings):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"message_id": "mid-out-1"}
    _signed_post(instagram_settings, _payload(igsid="ig-user-9", mid="mid-in-9", text="سلام"))
    session = SmartDirectSession.objects.get(instagram_user_id="ig-user-9")
    response = auth_api.post(
        f"/api/smart-direct/sessions/{session.id}/reply/",
        {"text": "موجود است"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["message_id"] == "mid-out-1"
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == "https://graph.instagram.com/v25.0/17841400000/messages"
    assert kwargs["json"]["recipient"]["id"] == "ig-user-9"
    assert kwargs["json"]["message"]["text"] == "موجود است"
    assert "EAA_test_token" in kwargs["headers"]["Authorization"]
    session.refresh_from_db()
    assert session.events.filter(event_type=SmartDirectEvent.EventType.ADMIN_REPLY_SENT).exists()
    context = session.temporary_context
    assert context.recent_messages[-1]["role"] == "admin"
    assert context.recent_messages[-1]["text"] == "موجود است"


@pytest.mark.django_db
def test_manual_reply_requires_customer_initiation(auth_api, instagram_settings):
    session = create_session(instagram_user_id="ig-user-8")
    response = auth_api.post(
        f"/api/smart-direct/sessions/{session.id}/reply/",
        {"text": "سلام"},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_instagram_endpoints_require_auth(instagram_settings):
    guest = APIClient()
    assert guest.get("/api/smart-direct/debug/").status_code in (401, 403)
    assert guest.post("/api/smart-direct/sessions/1/reply/", {"text": "x"}, format="json").status_code in (
        401,
        403,
        404,
    )


@pytest.mark.django_db
def test_debug_exposes_only_active_temporary_context(auth_api, instagram_settings):
    _signed_post(instagram_settings, _payload(igsid="ig-live", mid="mid-live", text="active-secret"))
    old = create_session(instagram_user_id="ig-old")
    store_temporary_context(old, recent_messages=[{"role": "customer", "text": "expired-secret"}])
    TemporaryConversationContext.objects.filter(session=old).update(
        expires_at=timezone.now() - timedelta(hours=1)
    )
    old.status = SmartDirectSession.Status.CLOSED
    old.save(update_fields=["status"])

    debug = auth_api.get("/api/smart-direct/debug/")
    summary = auth_api.get("/api/smart-direct/summary/")
    assert debug.status_code == summary.status_code == 200
    assert debug.data["debug_session"]["recent_messages"][-1]["text"] == "active-secret"
    assert b"expired-secret" not in debug.content
    assert b"active-secret" not in summary.content
    assert b"EAA_test_token" not in debug.content
    assert b"test-secret" not in debug.content
    assert summary.data["instagram"]["account_id"] == "17841400000"
    assert summary.data["instagram"]["webhook"]["url_path"] == "/api/smart-direct/instagram/webhook/"
