import hmac
import json
import logging

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status as http_status

from apps.smart_direct.instagram.client import InstagramSendError
from apps.smart_direct.instagram.inbound import handle_webhook_payload
from apps.smart_direct.instagram.outbound import ReplyNotAllowed, send_manual_reply
from apps.smart_direct.instagram.runtime import record_webhook_result
from apps.smart_direct.instagram.signature import signature_is_valid
from apps.smart_direct.models import SmartDirectSession
from apps.smart_direct.presentation import (
    build_connections,
    debug_session_payload,
    instagram_status_payload,
    session_detail_payload,
    session_summary_payload,
)
from apps.smart_direct.services import today_counts

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def summary(request):
    recent = list(SmartDirectSession.objects.all()[:10])
    return Response(
        {
            "connections": build_connections(),
            "instagram": instagram_status_payload(),
            "today": today_counts(),
            "recent_outcomes": [session_summary_payload(session) for session in recent],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def session_list(request):
    page = max(1, int(request.query_params.get("page") or 1))
    per_page = min(50, max(1, int(request.query_params.get("per_page") or 20)))
    qs = SmartDirectSession.objects.all()
    total = qs.count()
    start_idx = (page - 1) * per_page
    rows = list(qs[start_idx : start_idx + per_page])
    return Response(
        {
            "page": page,
            "per_page": per_page,
            "total": total,
            "results": [session_summary_payload(session) for session in rows],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def session_detail(request, session_id):
    session = get_object_or_404(SmartDirectSession.objects.prefetch_related("events"), pk=session_id)
    return Response(session_detail_payload(session))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def debug(request):
    return Response(
        {
            "label": "temporary_debug",
            "instagram": instagram_status_payload(),
            "debug_session": debug_session_payload(),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_reply(request, session_id):
    session = get_object_or_404(SmartDirectSession, pk=session_id)
    text = request.data.get("text") if isinstance(request.data, dict) else ""
    try:
        result = send_manual_reply(session, text)
    except ReplyNotAllowed as exc:
        return Response({"detail": str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
    except InstagramSendError:
        return Response(
            {"detail": "ارسال پیام به اینستاگرام ناموفق بود."},
            status=http_status.HTTP_502_BAD_GATEWAY,
        )
    return Response(result)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def instagram_webhook(request):
    if request.method == "GET":
        return _verify_webhook(request)
    return _receive_webhook(request)


def _tokens_match(expected, provided):
    expected = expected or ""
    provided = provided or ""
    if len(expected) != len(provided):
        return False
    return hmac.compare_digest(expected, provided)


def _verify_webhook(request):
    mode = request.GET.get("hub.mode") or ""
    token = request.GET.get("hub.verify_token") or ""
    challenge = request.GET.get("hub.challenge") or ""
    expected = getattr(settings, "INSTAGRAM_VERIFY_TOKEN", "") or ""
    if mode != "subscribe" or not expected or not challenge or not _tokens_match(expected, token):
        return HttpResponseForbidden("invalid verification")
    return HttpResponse(challenge, content_type="text/plain")


def _receive_webhook(request):
    secret = getattr(settings, "INSTAGRAM_APP_SECRET", "") or ""
    header = request.headers.get("X-Hub-Signature-256") or request.META.get("HTTP_X_HUB_SIGNATURE_256", "")
    body = request.body or b""
    if not signature_is_valid(secret, body, header):
        logger.warning("Rejected Instagram webhook with invalid signature.")
        try:
            record_webhook_result(status="invalid_signature", note="rejected")
        except Exception:
            logger.exception("Failed to record invalid webhook signature.")
        return HttpResponseForbidden("invalid signature")
    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        logger.exception("Instagram webhook JSON could not be parsed.")
        record_webhook_result(status="error", note="invalid_json")
        return HttpResponse(status=200)
    try:
        handle_webhook_payload(payload)
    except Exception:
        logger.exception("Instagram webhook processing failed.")
        record_webhook_result(status="error", note="processing")
        return HttpResponse(status=500)
    return HttpResponse(status=200)
