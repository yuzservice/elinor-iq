"""Versioned call forms (TierRuleSet pattern): one draft, one published; past logs keep their version."""

from django.db import transaction
from django.utils import timezone

from .models import CallAnswerFact, CallFormVersion, CallLog

FIELD_TYPES = ("single", "multi", "toggle", "text", "long_text", "number", "rating", "date", "time")
OPTION_TYPES = ("single", "multi")
AFTER_SAVE = ("close", "retry", "dnc")


class FormError(Exception):
    pass


def published_form(program):
    return program.forms.filter(status=CallFormVersion.STATUS_PUBLISHED).first()


def draft_form(program):
    return program.forms.filter(status=CallFormVersion.STATUS_DRAFT).first()


def used_ids(program):
    outcomes = set(CallLog.objects.filter(program=program).order_by().values_list("outcome_id", flat=True).distinct())
    options = set(
        CallAnswerFact.objects.filter(program=program, option_id__isnull=False)
        .order_by()
        .values_list("option_id", flat=True)
        .distinct()
    )
    return outcomes, options


def save_draft(program, schema):
    if not isinstance(schema, dict) or not isinstance(schema.get("outcomes"), list):
        raise FormError("ساختار فرم نامعتبر است.")
    with transaction.atomic():
        draft = program.forms.select_for_update().filter(status=CallFormVersion.STATUS_DRAFT).first()
        if draft:
            draft.schema = schema
            draft.save(update_fields=["schema", "updated_at"])
            return draft
        latest = program.forms.order_by("-version").values_list("version", flat=True).first() or 0
        return CallFormVersion.objects.create(
            program=program, version=latest + 1, status=CallFormVersion.STATUS_DRAFT, schema=schema
        )


def validate_schema(schema, used_outcomes=(), used_options=()):
    """Persian error messages; raises FormError on the first problem."""
    outcomes = schema.get("outcomes") or []
    if not [o for o in outcomes if o.get("is_active", True)]:
        raise FormError("دست‌کم یک نتیجه فعال لازم است.")
    seen_outcomes, seen_options = set(), set()
    for outcome in outcomes:
        title = (outcome.get("title") or "").strip()
        if not outcome.get("id") or not title:
            raise FormError("عنوان همه نتیجه‌ها لازم است.")
        seen_outcomes.add(outcome["id"])
        if outcome.get("after_save", "close") not in AFTER_SAVE:
            raise FormError(f"رفتار بعد از ثبت «{title}» نامعتبر است.")
        if outcome.get("after_save") == "retry" and (int(outcome.get("retry_times") or 0) < 1 or int(outcome.get("retry_gap") or 0) < 1):
            raise FormError(f"تعداد و فاصله تلاش مجدد «{title}» لازم است.")
        for field in outcome.get("fields") or []:
            field_title = (field.get("title") or "").strip()
            if not field.get("id") or not field_title:
                raise FormError(f"عنوان همه فیلدهای «{title}» لازم است.")
            if field.get("type") not in FIELD_TYPES:
                raise FormError(f"نوع فیلد «{field_title}» نامعتبر است.")
            if field.get("creates_followup") and field["type"] != "date":
                raise FormError(f"فقط فیلد تاریخ می‌تواند کار پیگیری بسازد («{field_title}»).")
            options = field.get("options") or []
            if field["type"] in OPTION_TYPES and not [o for o in options if o.get("is_active", True)]:
                raise FormError(f"فیلد «{field_title}» گزینه فعال ندارد.")
            for option in options:
                if not option.get("id") or not (option.get("title") or "").strip():
                    raise FormError(f"عنوان همه گزینه‌های «{field_title}» لازم است.")
                seen_options.add(option["id"])
    if set(used_outcomes) - seen_outcomes:
        raise FormError("نتیجه‌ای که در تماس‌ها استفاده شده را نمی‌توان حذف کرد؛ غیرفعالش کنید.")
    if set(used_options) - seen_options:
        raise FormError("گزینه‌ای که در تماس‌ها استفاده شده را نمی‌توان حذف کرد؛ غیرفعالش کنید.")


def publish(program):
    with transaction.atomic():
        draft = program.forms.select_for_update().filter(status=CallFormVersion.STATUS_DRAFT).first()
        if draft is None:
            raise FormError("پیش‌نویسی برای انتشار نیست.")
        validate_schema(draft.schema, *used_ids(program))
        program.forms.filter(status=CallFormVersion.STATUS_PUBLISHED).update(status=CallFormVersion.STATUS_ARCHIVED)
        draft.status = CallFormVersion.STATUS_PUBLISHED
        draft.published_at = timezone.now()
        draft.save(update_fields=["status", "published_at", "updated_at"])
        return draft
