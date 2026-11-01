import io
import zipfile
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.calls import forms, jobs, lists
from apps.calls.models import (
    CallEscalation,
    CallFormVersion,
    CallList,
    CallListMember,
    CallLog,
    CallLogPurchase,
    CallProgram,
    CallProgramAgent,
    CallSettings,
    CallTag,
    CallTask,
    CustomerCallStatus,
    CustomerCallTag,
)
from apps.customers.models import Customer, InternalAccount
from apps.sales.models import Order

_ids = iter(range(200_000, 299_999))


def _customer(n, **extra):
    return Customer.objects.create(source_id=n, first_name="الف", last_name=f"ب{n}", mobile=f"0912{n:07d}", status="active", **extra)


def _user(username, role):
    return get_user_model().objects.create_user(username=username, password="secret-pass", role=role)


def _client(user):
    client = APIClient()
    client.force_login(user)
    return client


def _schema(**outcome):
    base = {"id": "o1", "title": "پاسخ نداد", "is_active": True, "connected": False, "after_save": "close", "fields": []}
    return {"outcomes": [{**base, **outcome}]}


def _program(name="برنامه", customers=(), agents=(), schema=None, kind=CallList.KIND_FIXED, filter_params=None):
    call_list = CallList.objects.create(name="لیست", kind=kind, source=CallList.SOURCE_MANUAL, filter_params=filter_params or {})
    CallListMember.objects.bulk_create([CallListMember(list=call_list, customer=c) for c in customers])
    program = CallProgram.objects.create(name=name, list=call_list, status=CallProgram.STATUS_ACTIVE)
    for agent in agents:
        CallProgramAgent.objects.create(program=program, user=agent)
    forms.save_draft(program, schema or _schema())
    forms.publish(program)
    return program


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def sync_threads():
    """Background jobs run inline so tests can see their result."""

    class Inline:
        def __init__(self, target=None, args=(), kwargs=None, **_):
            self.target, self.args, self.kwargs = target, args, kwargs or {}

        def start(self):
            self.kwargs["close_connection"] = False
            self.target(*self.args, **self.kwargs)

    with patch("apps.calls.tasks.threading.Thread", Inline), patch("apps.calls.lists.threading.Thread", Inline):
        yield


@pytest.fixture
def agent(db):
    return _user("agent1", "sales_agent")


@pytest.fixture
def manager(db):
    return _user("boss", "admin")


# --- Permissions --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_sales_agent_is_scoped_to_calls_and_assigned_customers(agent):
    client = _client(agent)
    assigned, other = _customer(1), _customer(2)
    program = _program(customers=[assigned], agents=[agent])
    CallTask.objects.create(program=program, customer=assigned, assignee=agent, due_at=timezone.now())
    for path in ("/api/sales/overview/", "/api/customers/", "/api/home/summary/", "/api/customers/export/", "/api/system/status/", "/api/customers/reports/"):
        assert client.get(path).status_code == 403, path
    assert client.get(f"/api/customers/{other.source_id}/").status_code == 403
    assert client.get(f"/api/customers/{assigned.source_id}/").status_code == 200
    assert client.get(f"/api/customers/{assigned.source_id}/purchases/").status_code == 200
    assert client.get("/api/calls/programs/").status_code == 403  # manager only
    assert client.get("/api/auth/me/").data["can_manage_calls"] is False


@pytest.mark.django_db
def test_other_roles_cannot_manage_calls(manager):
    assert _client(manager).get("/api/calls/programs/").status_code == 200
    assert _client(_user("an", "analyst")).get("/api/calls/programs/").status_code == 403
    assert APIClient().get("/api/calls/programs/").status_code in (401, 403)


# --- Forms ---------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_publish_validates_and_versions():
    program = CallProgram.objects.create(name="پ")
    forms.save_draft(program, _schema(title=" "))
    with pytest.raises(forms.FormError):
        forms.publish(program)
    forms.save_draft(program, _schema(fields=[{"id": "f1", "type": "single", "title": "دسته", "options": []}]))
    with pytest.raises(forms.FormError):
        forms.publish(program)
    forms.save_draft(program, _schema())
    first = forms.publish(program)
    assert (first.version, first.status) == (1, "published")
    forms.save_draft(program, _schema(title="جدید"))
    second = forms.publish(program)
    first.refresh_from_db()
    assert (second.version, first.status) == (2, "archived")
    assert CallFormVersion.objects.filter(program=program, status="published").count() == 1


# --- Lists and activation ----------------------------------------------------------------------


@pytest.mark.django_db
def test_preview_and_activation_exclude_and_split(agent, manager, sync_threads):
    agent2 = _user("agent2", "sales_agent")
    customers = [_customer(n) for n in range(1, 9)]
    internal, dnc, recent, busy = customers[:4]
    InternalAccount.objects.create(customer=internal, kind="staff")
    CustomerCallStatus.objects.create(customer=dnc, do_not_call=True)
    CustomerCallStatus.objects.create(customer=recent, next_call_allowed_at=timezone.now() + timedelta(days=3))
    other = _program(name="دیگر", agents=[agent])
    CallTask.objects.create(program=other, customer=busy, assignee=agent, due_at=timezone.now())

    program = _program(customers=customers, agents=[agent, agent2])
    client = _client(manager)
    preview = client.get(f"/api/calls/programs/{program.pk}/preview/").data
    assert preview == {"total": 8, "internal": 1, "do_not_call": 1, "recent": 1, "open_task": 1, "eligible": 4, "excluded": 4}

    assert client.post(f"/api/calls/programs/{program.pk}/activate/").status_code == 202
    rows = CallTask.objects.filter(program=program)
    assert rows.count() == 4
    assert rows.filter(assignee=agent).count() == 2 and rows.filter(assignee=agent2).count() == 2
    program.refresh_from_db()
    assert (program.job_status, program.job_done, program.job_total) == ("done", 4, 4)

    client.post(f"/api/calls/programs/{program.pk}/activate/")  # idempotent
    assert CallTask.objects.filter(program=program).count() == 4


@pytest.mark.django_db
def test_custom_share_must_total_100_and_splits_by_percent(agent, manager, sync_threads):
    agent2 = _user("agent2", "sales_agent")
    program = _program(customers=[_customer(n) for n in range(1, 11)], agents=[])
    CallProgramAgent.objects.create(program=program, user=agent, share_percent=70)
    CallProgramAgent.objects.create(program=program, user=agent2, share_percent=20)
    CallProgram.objects.filter(pk=program.pk).update(share_mode="custom")
    client = _client(manager)
    assert client.post(f"/api/calls/programs/{program.pk}/activate/").status_code == 400
    CallProgramAgent.objects.filter(user=agent2).update(share_percent=30)
    assert client.post(f"/api/calls/programs/{program.pk}/activate/").status_code == 202
    assert CallTask.objects.filter(assignee=agent).count() == 7


@pytest.mark.django_db
def test_second_activation_is_refused_while_running(agent, manager):
    program = _program(customers=[_customer(1)], agents=[agent])
    CallProgram.objects.filter(pk=program.pk).update(job_status="running", job_started_at=timezone.now())
    assert _client(manager).post(f"/api/calls/programs/{program.pk}/activate/").status_code == 409


@pytest.mark.django_db
def test_list_creation_fixed_dynamic_and_manual(manager, sync_threads):
    a, b = _customer(1), _customer(2)
    Order.objects.create(source_id=next(_ids), customer=a, status="delivered", total_amount=1, created_at=timezone.now())
    Customer.objects.filter(pk=a.pk).update(order_count=1)
    client = _client(manager)
    fixed = client.post("/api/calls/lists/", {"name": "ثابت", "kind": "fixed", "filter_params": {"population": "purchasing"}}, format="json")
    assert fixed.status_code == 201
    row = CallList.objects.get(pk=fixed.data["id"])
    assert (row.customer_count, row.job_status, row.members.count()) == (1, "done", 1)
    dynamic = client.post("/api/calls/lists/", {"name": "پویا", "kind": "dynamic", "filter_params": {"population": "purchasing"}}, format="json")
    row = CallList.objects.get(pk=dynamic.data["id"])
    assert (row.customer_count, row.members.count()) == (1, 0)
    manual = client.post("/api/calls/lists/", {"name": "دستی", "customer_ids": [a.source_id, b.source_id]}, format="json")
    assert CallList.objects.get(pk=manual.data["id"]).members.count() == 2


def _xlsx(values):
    cells = "".join(f'<row><c t="inlineStr"><is><t>{value}</t></is></c></row>' for value in values)
    sheet = f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{cells}<row><c><v>9120000002</v></c></row></sheetData></worksheet>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as book:
        book.writestr("xl/worksheets/sheet1.xml", sheet)
    return buffer.getvalue()


@pytest.mark.django_db
def test_excel_upload_reports_unknown_numbers(manager, sync_threads):
    a, b = _customer(1), _customer(2)
    client = _client(manager)
    data = _xlsx([a.mobile, "نام", "09990000000"])
    upload = io.BytesIO(data)
    upload.name = "n.xlsx"
    dry = client.post("/api/calls/lists/excel/", {"file": upload, "dry_run": "1"}, format="multipart")
    assert (dry.data["matched"], dry.data["unknown"]) == (2, 1)
    assert CallList.objects.count() == 0
    upload = io.BytesIO(data)
    upload.name = "n.xlsx"
    saved = client.post("/api/calls/lists/excel/", {"file": upload, "name": "اکسل"}, format="multipart")
    assert saved.status_code == 201
    assert CallList.objects.get(pk=saved.data["list"]["id"]).members.count() == 2
    bad = io.BytesIO(b"not a zip")
    bad.name = "bad.xlsx"
    assert client.post("/api/calls/lists/excel/", {"file": bad, "dry_run": "1"}, format="multipart").status_code == 400


# --- Saving logs ---------------------------------------------------------------------------------


def _task(program, customer, agent_user, **extra):
    return CallTask.objects.create(program=program, customer=customer, assignee=agent_user, due_at=timezone.now(), **extra)


def _save(client, task, outcome="o1", note="", answers=None):
    return client.post(f"/api/calls/tasks/{task.pk}/logs/", {"outcome_id": outcome, "note": note, "answers": answers or {}}, format="json")


LONG_NOTE = "مشتری منتظر مدل جدید است و تماس می‌گیرد"


@pytest.mark.django_db
def test_one_click_outcome_and_note_rule(agent):
    customer = _customer(1)
    program = _program(agents=[agent], schema={"outcomes": [
        {"id": "o1", "title": "پاسخ نداد", "connected": False, "after_save": "close", "fields": []},
        {"id": "o2", "title": "صحبت شد", "connected": True, "after_save": "close", "fields": []},
    ]})
    client = _client(agent)
    task = _task(program, customer, agent)
    assert _save(client, task, "o2", note="کوتاه").status_code == 400
    response = _save(client, task, "o1")
    assert response.status_code == 201
    task.refresh_from_db()
    assert (task.status, task.last_outcome_title) == ("done", "پاسخ نداد")
    assert _save(client, task, "o1").status_code == 409  # no longer open


@pytest.mark.django_db
def test_retries_then_unreachable(agent):
    customer = _customer(1)
    program = _program(agents=[agent], schema=_schema(after_save="retry", retry_times=2, retry_gap=4, retry_unit="hour"))
    client = _client(agent)
    task = _task(program, customer, agent)
    before = timezone.now()
    assert _save(client, task).data["result"] == "retry"
    task.refresh_from_db()
    assert (task.status, task.attempt, task.source) == ("open", 2, "retry")
    assert task.due_at >= before + timedelta(hours=4)
    assert _save(client, task).data["result"] == "retry"
    assert _save(client, task).data["result"] == "unreachable"
    task.refresh_from_db()
    assert (task.status, task.last_outcome_title, task.attempt) == ("unreachable", "در دسترس نبود", 3)
    assert task.logs.count() == 3
    assert CustomerCallStatus.objects.get(customer=customer).next_call_allowed_at is None  # not connected, no no_call_days


@pytest.mark.django_db
def test_dnc_blocks_future_lists(agent, sync_threads):
    customer = _customer(1)
    program = _program(customers=[customer], agents=[agent], schema=_schema(after_save="dnc"))
    client = _client(agent)
    task = _task(program, customer, agent)
    assert _save(client, task).data["result"] == "dnc"
    task.refresh_from_db()
    assert task.status == "cancelled"
    assert CustomerCallStatus.objects.get(customer=customer).do_not_call is True
    assert lists.preview_counts(program.list)["do_not_call"] == 1
    assert not lists.eligible_customers(program.list, _program(name="نو", agents=[agent])).exists()


@pytest.mark.django_db
def test_no_call_days_and_default_gap(agent):
    a, b, c = _customer(1), _customer(2), _customer(3)
    program = _program(agents=[agent], schema={"outcomes": [
        {"id": "gap", "title": "صحبت", "connected": True, "after_save": "close", "fields": []},
        {"id": "days", "title": "بعدا", "connected": False, "after_save": "close", "no_call_days": 5, "fields": []},
        {"id": "none", "title": "نه", "connected": False, "after_save": "close", "fields": []},
    ]})
    client = _client(agent)
    now = timezone.now()
    _save(client, _task(program, a, agent), "gap", note=LONG_NOTE)
    _save(client, _task(program, b, agent), "days")
    _save(client, _task(program, c, agent), "none")
    status = {row.customer_id: row.next_call_allowed_at for row in CustomerCallStatus.objects.all()}
    assert timedelta(days=29) < status[a.pk] - now <= timedelta(days=30, seconds=5)
    assert timedelta(days=4) < status[b.pk] - now <= timedelta(days=5, seconds=5)
    assert status[c.pk] is None


@pytest.mark.django_db
def test_followup_escalation_answers_and_facts(agent):
    customer = _customer(1)
    tag = CallTag.objects.get(title="فرصت فروش")
    day = (timezone.localdate() + timedelta(days=9)).isoformat()
    schema = _schema(connected=True, escalate=True, tag_ids=[], fields=[
        {"id": "cat", "type": "multi", "title": "دسته", "required": True, "options": [
            {"id": "x", "title": "مانتو", "is_active": True, "tag_ids": [tag.pk]},
            {"id": "y", "title": "کفش", "is_active": True},
            {"id": "z", "title": "قدیمی", "is_active": False},
        ]},
        {"id": "rate", "type": "rating", "title": "امتیاز"},
        {"id": "ok", "type": "toggle", "title": "معرفی"},
        {"id": "when", "type": "date", "title": "تماس بعدی", "creates_followup": True},
        {"id": "free", "type": "text", "title": "توضیح"},
    ])
    program = _program(agents=[agent], schema=schema)
    client = _client(agent)
    task = _task(program, customer, agent)
    assert _save(client, task, note=LONG_NOTE).status_code == 400  # required multi missing
    bad = _save(client, task, note=LONG_NOTE, answers={"cat": ["z"]})
    assert bad.status_code == 400 and "cat" in bad.data["errors"]  # inactive option
    good = _save(client, task, note=LONG_NOTE, answers={"cat": ["x", "y"], "rate": 4, "ok": True, "when": day, "free": "سلام"})
    assert good.status_code == 201
    log = CallLog.objects.get()
    assert log.answers["cat"]["labels"] == ["مانتو", "کفش"] and log.tag_ids == [tag.pk]
    assert sorted((f.field_id, f.option_id or "", f.number_value) for f in log.facts.all()) == [
        ("cat", "x", None), ("cat", "y", None), ("ok", "", 1), ("rate", "", 4),
    ]
    followup = CallTask.objects.get(status="open")
    assert (followup.source, timezone.localtime(followup.due_at).date().isoformat(), followup.last_tag_ids) == ("followup", day, [tag.pk])
    assert CallEscalation.objects.filter(log=log, status="open").count() == 1
    assert CustomerCallTag.objects.filter(customer=customer, tag=tag, resolved_at=None).count() == 1


@pytest.mark.django_db
def test_single_open_task_per_customer(agent):
    customer = _customer(1)
    program, other = _program(agents=[agent]), _program(name="دو", agents=[agent])
    _task(program, customer, agent)
    with pytest.raises(IntegrityError), transaction.atomic():
        _task(other, customer, agent)


@pytest.mark.django_db
def test_log_edit_window_and_versions_survive_republish(agent):
    customer = _customer(1)
    program = _program(agents=[agent], schema=_schema(connected=True))
    client = _client(agent)
    task = _task(program, customer, agent)
    log_id = _save(client, task, note=LONG_NOTE).data["log_id"]
    forms.save_draft(program, _schema(title="نام جدید", connected=True))
    forms.publish(program)
    log = CallLog.objects.get(pk=log_id)
    assert (log.outcome_title, log.form_version.version) == ("پاسخ نداد", 1)
    assert client.patch(f"/api/calls/logs/{log_id}/", {"note": LONG_NOTE + " ویرایش", "answers": {}}, format="json").status_code == 200
    assert _client(_user("agent9", "sales_agent")).patch(f"/api/calls/logs/{log_id}/", {"note": LONG_NOTE, "answers": {}}, format="json").status_code == 404
    CallLog.objects.filter(pk=log_id).update(created_at=timezone.now() - timedelta(hours=25))
    assert client.patch(f"/api/calls/logs/{log_id}/", {"note": LONG_NOTE, "answers": {}}, format="json").status_code == 403


@pytest.mark.django_db
def test_used_outcome_cannot_be_deleted(agent):
    customer = _customer(1)
    program = _program(agents=[agent], schema={"outcomes": [
        {"id": "o1", "title": "الف", "connected": False, "after_save": "close", "fields": []},
        {"id": "o2", "title": "ب", "connected": False, "after_save": "close", "fields": []},
    ]})
    _save(_client(agent), _task(program, customer, agent), "o1")
    forms.save_draft(program, {"outcomes": [{"id": "o2", "title": "ب", "connected": False, "after_save": "close", "fields": []}]})
    with pytest.raises(forms.FormError):
        forms.publish(program)


@pytest.mark.django_db
def test_agent_list_tabs_counts_and_scope(agent):
    other_agent = _user("agent2", "sales_agent")
    program = _program(agents=[agent])
    now = timezone.now()
    overdue = _task(program, _customer(1), agent)
    CallTask.objects.filter(pk=overdue.pk).update(due_at=now - timedelta(days=3))
    today = _task(program, _customer(2), agent, customer_value=500)
    future = _task(program, _customer(3), agent)
    CallTask.objects.filter(pk=future.pk).update(due_at=now + timedelta(days=4))
    _task(program, _customer(4), other_agent)
    client = _client(agent)
    counts = client.get("/api/calls/tasks/counts/").data
    assert (counts["open"], counts["overdue"], counts["today"], counts["future"], counts["done"]) == (3, 1, 1, 1, 0)
    assert client.get("/api/calls/tasks/?tab=overdue").data["results"][0]["id"] == overdue.pk
    assert client.get("/api/calls/tasks/?sort=value").data["results"][0]["id"] == today.pk
    assert client.get("/api/calls/tasks/?q=09120000001").data["total"] == 1
    assert client.get("/api/calls/tasks/?per_page=500").data["per_page"] == 50
    foreign = CallTask.objects.get(assignee=other_agent)
    assert client.get(f"/api/calls/tasks/{foreign.pk}/").status_code == 404
    assert _save(client, foreign).status_code == 404
    client.post("/api/calls/tasks/bulk/", {"ids": [today.pk, foreign.pk], "action": "postpone", "days": 7}, format="json")
    today.refresh_from_db(), foreign.refresh_from_db()
    assert today.due_at > now + timedelta(days=6) and foreign.due_at < now + timedelta(days=6)
    CallProgram.objects.filter(pk=program.pk).update(status="paused")
    assert client.get("/api/calls/tasks/").data["total"] == 0  # paused programs hide their tasks


@pytest.mark.django_db
def test_customer_calls_endpoint_scope(agent, manager):
    customer, other = _customer(1), _customer(2)
    program = _program(agents=[agent], schema=_schema(after_save="dnc"))
    _save(_client(agent), _task(program, customer, agent))
    data = _client(manager).get(f"/api/calls/customers/{customer.source_id}/").data
    assert data["status"]["do_not_call"] is True and data["total"] == 1
    assert _client(agent).get(f"/api/calls/customers/{other.source_id}/").status_code == 403


# --- Attribution, dynamic lists, reports ---------------------------------------------------------


def _connected_log(client, program, customer, agent_user, when):
    task = _task(program, customer, agent_user)
    response = _save(client, task, note=LONG_NOTE)
    assert response.status_code == 201
    CallLog.objects.filter(pk=response.data["log_id"]).update(created_at=when)
    return CallLog.objects.get(pk=response.data["log_id"])


def _order(customer, when, amount, status="delivered"):
    return Order.objects.create(source_id=next(_ids), customer=customer, status=status, total_amount=amount, created_at=when)


@pytest.mark.django_db
def test_attribution_once_to_latest_connected_call_and_idempotent(agent):
    customer = _customer(1)
    program = _program(agents=[agent], schema=_schema(connected=True))
    client = _client(agent)
    now = timezone.now()
    first = _connected_log(client, program, customer, agent, now - timedelta(days=10))
    second = _connected_log(client, program, customer, agent, now - timedelta(days=5))
    _order(customer, now - timedelta(days=7), 100)  # after first, before second -> first
    _order(customer, now - timedelta(days=2), 250)  # after both -> second only
    _order(customer, now - timedelta(days=3), 50)  # also second
    _order(customer, now - timedelta(days=1), 9999, status="canceled")  # not qualifying
    jobs.attribute_purchases(now)
    jobs.attribute_purchases(now)
    assert CallLogPurchase.objects.get(log=first).amount == 100
    row = CallLogPurchase.objects.get(log=second)
    assert (row.amount, row.purchase_count) == (300, 2)
    assert CallLogPurchase.objects.count() == 2


@pytest.mark.django_db
def test_attribution_window_excludes_late_and_internal(agent):
    late, staff = _customer(1), _customer(2)
    program = _program(agents=[agent], schema=_schema(connected=True))
    client = _client(agent)
    now = timezone.now()
    _connected_log(client, program, late, agent, now - timedelta(days=20))
    log = _connected_log(client, program, staff, agent, now - timedelta(days=5))
    CallSettings.objects.filter(pk=1).update(buy_window_days=10)
    _order(late, now - timedelta(days=2), 100)  # 18 days after the call, window is 10
    _order(staff, now - timedelta(days=1), 100)
    InternalAccount.objects.create(customer=staff, kind="staff")
    jobs.attribute_purchases(now)
    assert not CallLogPurchase.objects.exists()
    assert log.pk


@pytest.mark.django_db
def test_purchase_closes_open_until_purchase_tag_only(agent, manager):
    customer = _customer(1)
    sale_tag, unhappy = CallTag.objects.get(title="فرصت فروش"), CallTag.objects.get(title="نارضایتی")
    program = _program(agents=[agent], schema=_schema(connected=True, tag_ids=[sale_tag.pk, unhappy.pk]))
    client = _client(agent)
    _save(client, _task(program, customer, agent), note=LONG_NOTE)
    report = _client(manager).get("/api/calls/reports/sales/").data
    assert {card["title"]: card["count"] for card in report["cards"]}["فرصت فروش"] == 1
    _order(customer, timezone.now() + timedelta(seconds=1), 500)
    jobs.attribute_purchases(timezone.now() + timedelta(seconds=2))
    assert CustomerCallTag.objects.get(tag=sale_tag).resolved_at is not None
    assert CustomerCallTag.objects.get(tag=unhappy).resolved_at is None


@pytest.mark.django_db
def test_dynamic_list_daily_adds_only_new_matches(agent, sync_threads):
    a = _customer(1)
    _order(a, timezone.now() - timedelta(days=1), 100)
    Customer.objects.filter(pk=a.pk).update(order_count=1)
    program = _program(agents=[agent], kind=CallList.KIND_DYNAMIC, filter_params={"population": "purchasing"})
    jobs.run_daily()
    assert CallTask.objects.filter(program=program).count() == 1
    task = CallTask.objects.get(program=program)
    CallTask.objects.filter(pk=task.pk).update(status="done", closed_at=timezone.now())
    b = _customer(2)
    _order(b, timezone.now() - timedelta(days=1), 100)
    Customer.objects.filter(pk=b.pk).update(order_count=1)
    assert jobs.run_daily(if_due=True) == "skipped"
    jobs.run_daily()
    assert set(CallTask.objects.filter(program=program).values_list("customer_id", flat=True)) == {a.pk, b.pk}
    assert CallTask.objects.filter(program=program).count() == 2  # the finished customer is not added again
    assert CallListMember.objects.filter(list=program.list).count() == 0


@pytest.mark.django_db
def test_reports_answers_team_and_escalation_close(agent, manager):
    customer = _customer(1)
    schema = _schema(connected=True, escalate=True, fields=[
        {"id": "cat", "type": "single", "title": "دسته", "options": [{"id": "x", "title": "مانتو", "is_active": True}]},
        {"id": "rate", "type": "rating", "title": "امتیاز"},
        {"id": "ok", "type": "toggle", "title": "معرفی"},
        {"id": "free", "type": "text", "title": "نظر"},
    ])
    program = _program(agents=[agent], schema=schema)
    log = _save(_client(agent), _task(program, customer, agent), note=LONG_NOTE, answers={"cat": "x", "rate": 4, "ok": True, "free": "عالی"})
    CallLogPurchase.objects.create(log_id=log.data["log_id"], purchased_at=timezone.now(), amount=700)
    boss = _client(manager)
    assert boss.get("/api/calls/reports/answers/").status_code == 400
    widgets = {row["id"]: row for row in boss.get(f"/api/calls/reports/answers/?program={program.pk}").data["widgets"]}
    assert widgets["cat"]["bars"] == [{"label": "مانتو", "value": 1}]
    assert widgets["rate"]["avg"] == 4.0 and widgets["ok"]["yes"] == 1 and widgets["free"]["texts"] == ["عالی"]
    team = boss.get(f"/api/calls/reports/team/?program={program.pk}").data["results"][0]
    assert (team["agent"], team["calls"], team["reached"], team["buyers"], team["sales"]) == ("agent1", 1, 1, 1, 700)
    sales = boss.get(f"/api/calls/reports/sales/?program={program.pk}").data
    assert (sales["kpis"]["sales"], sales["kpis"]["buyers"]) == (700, 1)
    assert sales["outcomes"][0]["buyers"] == 1
    rows = boss.get(f"/api/calls/reports/customers/?program={program.pk}").data
    assert rows["results"][0]["agent"] == "agent1" and rows["total"] == 1
    open_rows = boss.get("/api/calls/reports/escalations/").data["results"]
    assert boss.post(f"/api/calls/escalations/{open_rows[0]['id']}/close/").status_code == 200
    assert boss.post(f"/api/calls/escalations/{open_rows[0]['id']}/close/").status_code == 409
    assert _client(agent).get("/api/calls/reports/sales/").status_code == 403
