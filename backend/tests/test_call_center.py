import io
import zipfile
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.calls import forms, lists, tasks
from apps.calls.models import (
    CallFormVersion,
    CallList,
    CallListMember,
    CallProgram,
    CallProgramAgent,
    CallTask,
    CustomerCallStatus,
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
