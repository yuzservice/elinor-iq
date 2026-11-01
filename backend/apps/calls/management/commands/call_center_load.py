"""Dev-only load test: synthetic data in a scratch database. Never run in production.

  POSTGRES_DB=elinor_load python manage.py call_center_load --seed
  POSTGRES_DB=elinor_load python manage.py call_center_load --measure
"""

import json
import time
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.calls import jobs
from apps.calls.models import CallFormVersion, CallLog, CallProgram, CallTask
from apps.customers.models import Customer
from apps.sales.models import Order

CUSTOMERS = 100_000
ORDERS = 200_000
LOGS = 300_000
FACTS = 1_000_000
CLOSED_TASKS = 500_000
OPEN_TASKS = 5_000
AGENTS = 5
PROGRAMS = 10


def _schema():
    titles = ("مانتو", "شلوار", "کفش", "کیف")
    options = [{"id": f"opt-{index}", "title": title, "is_active": True, "tag_ids": []} for index, title in enumerate(titles)]
    single = {"id": "f-cat", "type": "single", "title": "دسته", "required": True, "options": options}
    rating = {"id": "f-rate", "type": "rating", "title": "امتیاز"}
    toggle = {"id": "f-ok", "type": "toggle", "title": "معرفی"}
    number = {"id": "f-num", "type": "number", "title": "بودجه"}
    return {
        "outcomes": [
            {"id": "o-no", "title": "پاسخ نداد", "is_active": True, "connected": False, "after_save": "retry", "retry_times": 3, "retry_gap": 2, "retry_unit": "day", "fields": []},
            {"id": "o-yes", "title": "علاقه‌مند است", "is_active": True, "connected": True, "after_save": "close", "fields": [single, rating, toggle, number]},
            {"id": "o-bad", "title": "ناراضی است", "is_active": True, "connected": True, "after_save": "close", "escalate": True, "fields": [rating]},
            {"id": "o-dnc", "title": "تماس نگیرید", "is_active": True, "connected": False, "after_save": "dnc", "fields": []},
        ]
    }


class Command(BaseCommand):
    help = "Seed or measure the Call Center load test (scratch database only)."

    def add_arguments(self, parser):
        parser.add_argument("--seed", action="store_true")
        parser.add_argument("--measure", action="store_true")

    def handle(self, *args, **options):
        name = settings.DATABASES["default"]["NAME"]
        if "load" not in name:
            raise CommandError(f"Refusing to run on database {name!r}: its name must contain 'load'.")
        if options["seed"]:
            self.seed()
        if options["measure"]:
            self.measure()

    def seed(self):
        User = get_user_model()
        agents = [User.objects.get_or_create(username=f"load_agent{i}", defaults={"role": "sales_agent"})[0] for i in range(AGENTS)]
        User.objects.get_or_create(username="load_boss", defaults={"role": "admin"})
        ids = [agent.pk for agent in agents]
        Customer.objects.bulk_create(
            [Customer(source_id=9_000_000 + n, first_name="مشتری", last_name=f"نمونه {n}", mobile=f"0910{n:07d}", status="active", tier_code="SILVER") for n in range(CUSTOMERS)],
            batch_size=5000,
        )
        programs = [CallProgram.objects.create(name=f"برنامه {i}", status="active") for i in range(PROGRAMS)]
        forms = {
            program.pk: CallFormVersion.objects.create(program=program, version=1, status="published", schema=_schema(), published_at=timezone.now())
            for program in programs
        }
        low, high = Customer.objects.order_by("id").values_list("id", flat=True).first(), Customer.objects.order_by("-id").values_list("id", flat=True).first()
        program_ids = [program.pk for program in programs]
        form_ids = [forms[pk].pk for pk in program_ids]
        self.stdout.write("orders...")
        customer_range = range(low, high + 1)
        now = timezone.now()
        Order.objects.bulk_create(
            [
                Order(source_id=50_000_000 + n, customer_id=customer_range[n % CUSTOMERS], status="delivered", total_amount=(n % 90) * 100_000, created_at=now - timedelta(days=n % 700))
                for n in range(ORDERS)
            ],
            batch_size=5000,
        )
        with connection.cursor() as cursor:
            self.stdout.write("tasks...")
            cursor.execute(
                f"""
                INSERT INTO call_tasks (program_id, customer_id, assignee_id, due_at, attempt, is_priority, source, status,
                                        last_outcome_title, last_tag_ids, customer_value, closed_at, created_at)
                SELECT (%s::bigint[])[1 + n %% {PROGRAMS}], {low} + (n * 7) %% ({high - low + 1}), (%s::bigint[])[1 + n %% {AGENTS}],
                       now() - (n %% 700) * interval '1 day', 1, FALSE, 'new', 'done', 'علاقه‌مند است', '{{}}', n %% 50000000,
                       now() - (n %% 700) * interval '1 day', now() - (n %% 700) * interval '1 day'
                FROM generate_series(1, {CLOSED_TASKS}) n
                """,
                [program_ids, ids],
            )
            cursor.execute(
                f"""
                INSERT INTO call_tasks (program_id, customer_id, assignee_id, due_at, attempt, is_priority, source, status,
                                        last_outcome_title, last_tag_ids, customer_value, created_at)
                SELECT (%s::bigint[])[1 + n %% {PROGRAMS}], {low} + n, (%s::bigint[])[1 + n %% {AGENTS}],
                       now() + ((n %% 21) - 10) * interval '1 day', 1, n %% 50 = 0, 'new', 'open', '', '{{}}', n %% 50000000, now()
                FROM generate_series(1, {OPEN_TASKS}) n
                """,
                [program_ids, ids],
            )
            self.stdout.write("logs...")
            cursor.execute(
                f"""
                INSERT INTO call_logs (task_id, customer_id, agent_id, program_id, form_version_id, outcome_id, outcome_title, connected,
                                       answers, tag_ids, note, created_at)
                SELECT t.id, t.customer_id, t.assignee_id, t.program_id,
                       (%s::bigint[])[array_position(%s::bigint[], t.program_id)],
                       CASE WHEN t.id %% 3 = 0 THEN 'o-no' ELSE 'o-yes' END, CASE WHEN t.id %% 3 = 0 THEN 'پاسخ نداد' ELSE 'علاقه‌مند است' END,
                       t.id %% 3 <> 0, '{{"f-rate": {{"type": "rating", "title": "امتیاز", "value": 4}}}}'::jsonb, '{{}}',
                       'یادداشت نمونه برای آزمون بار', t.closed_at
                FROM (SELECT * FROM call_tasks WHERE status = 'done' ORDER BY id LIMIT {LOGS}) t
                """,
                [form_ids, program_ids],
            )
            self.stdout.write("facts...")
            # No query params here: % is the plain modulo operator.
            cursor.execute(
                f"""
                INSERT INTO call_answer_facts (log_id, program_id, field_id, option_id, number_value, created_at)
                SELECT l.id, l.program_id, f.field_id, f.option_id, f.value, l.created_at
                FROM (SELECT * FROM call_logs WHERE connected) l
                CROSS JOIN LATERAL (VALUES
                    ('f-rate', NULL, (l.id % 5) + 1),
                    ('f-num', NULL, (l.id % 90)),
                    ('f-ok', NULL, (l.id % 2)),
                    ('f-cat', 'opt-' || (l.id % 4), NULL),
                    ('f-mul', 'opt-' || (l.id % 7), NULL)
                ) f(field_id, option_id, value)
                LIMIT {FACTS}
                """
            )
            cursor.execute(
                "INSERT INTO customer_call_tags (customer_id, tag_id, program_id, log_id, tagged_at) "
                "SELECT DISTINCT ON (l.customer_id) l.customer_id, (SELECT MIN(id) FROM call_tags), l.program_id, l.id, l.created_at "
                "FROM call_logs l WHERE l.id % 10 = 0 ORDER BY l.customer_id, l.created_at DESC"
            )
            cursor.execute(
                "INSERT INTO call_escalations (log_id, customer_id, status) "
                "SELECT id, customer_id, 'open' FROM call_logs WHERE id % 150 = 0"
            )
            cursor.execute(
                "INSERT INTO call_log_purchases (log_id, purchased_at, amount, purchase_count) "
                "SELECT id, created_at + interval '3 days', (id % 90) * 100000, 1 FROM call_logs WHERE connected AND id % 8 = 0"
            )
            cursor.execute(
                "INSERT INTO customer_call_status (customer_id, do_not_call, next_call_allowed_at, last_outcome_title, last_call_at) "
                "SELECT customer_id, FALSE, NULL, 'علاقه‌مند است', MAX(created_at) FROM call_logs GROUP BY customer_id"
            )
            cursor.execute("ANALYZE")
        self.stdout.write(self.style.SUCCESS("seeded"))

    def _timed(self, label, request):
        start = time.perf_counter()
        response = request()
        elapsed = (time.perf_counter() - start) * 1000
        self.stdout.write(f"{label:32s} {elapsed:8.1f} ms  (HTTP {response.status_code})")
        return response

    def measure(self):
        User = get_user_model()
        agent = User.objects.get(username="load_agent0")
        boss = User.objects.get(username="load_boss")
        as_agent, as_boss = APIClient(HTTP_HOST="localhost"), APIClient(HTTP_HOST="localhost")
        as_agent.force_login(agent)
        as_boss.force_login(boss)
        program = CallProgram.objects.order_by("id").first()

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables "
                "WHERE relname LIKE 'call_%' OR relname LIKE 'customer_call%' ORDER BY pg_total_relation_size(relid) DESC"
            )
            self.stdout.write("--- table sizes (rows, total size with indexes)")
            for row in cursor.fetchall():
                self.stdout.write(f"{row[0]:28s} {row[1]:>10} {row[2]}")

        self.stdout.write("--- agent (1000 open tasks; target < 300 ms)")
        cache.clear()
        self._timed("list open, sort due", lambda: as_agent.get("/api/calls/tasks/?tab=open&per_page=20"))
        self._timed("list overdue", lambda: as_agent.get("/api/calls/tasks/?tab=overdue&per_page=20"))
        self._timed("list sort value, page 10", lambda: as_agent.get("/api/calls/tasks/?sort=value&page=10&per_page=20"))
        self._timed("list search name", lambda: as_agent.get("/api/calls/tasks/?q=%D9%86%D9%85%D9%88%D9%86%D9%87%2012"))
        self._timed("list done tab", lambda: as_agent.get("/api/calls/tasks/?tab=done&per_page=20"))
        self._timed("tab counts cold", lambda: as_agent.get("/api/calls/tasks/counts/"))
        self._timed("tab counts cached", lambda: as_agent.get("/api/calls/tasks/counts/"))
        task = CallTask.objects.filter(assignee=agent, status="open").order_by("due_at").first()
        self._timed("task detail", lambda: as_agent.get(f"/api/calls/tasks/{task.pk}/"))
        payload = {"outcome_id": "o-yes", "note": "یادداشت آزمون بار با طول کافی برای ثبت", "answers": {"f-cat": _schema_option(task), "f-rate": 4, "f-ok": True, "f-num": 5}}
        self._timed("save log (connected, 4 fields)", lambda: as_agent.post(f"/api/calls/tasks/{task.pk}/logs/", json.dumps(payload), content_type="application/json"))

        self.stdout.write("--- reports (cold target < 1 s, cached < 100 ms)")
        for name, path in (
            ("sales all", "/api/calls/reports/sales/"),
            ("sales program", f"/api/calls/reports/sales/?program={program.pk}"),
            ("answers program", f"/api/calls/reports/answers/?program={program.pk}"),
            ("team all", "/api/calls/reports/team/"),
        ):
            cache.clear()
            self._timed(f"{name} cold", lambda: as_boss.get(path))
            self._timed(f"{name} cached", lambda: as_boss.get(path))
        self._timed("customers page 1", lambda: as_boss.get("/api/calls/reports/customers/?page=1"))
        self._timed("customers page 1 program", lambda: as_boss.get(f"/api/calls/reports/customers/?page=1&program={program.pk}"))
        self._timed("escalations", lambda: as_boss.get("/api/calls/reports/escalations/"))

        self.stdout.write("--- EXPLAIN ANALYZE")
        plans = {
            "agent open list": CallTask.objects.filter(assignee=agent, status="open", program__status="active").order_by("due_at", "id")[:20],
            "agent done list": CallTask.objects.filter(assignee=agent).exclude(status="open").order_by("-closed_at")[:20],
            "customer history": CallLog.objects.filter(customer_id=task.customer_id).order_by("-created_at")[:20],
            "program logs": CallLog.objects.filter(program=program).order_by("-created_at")[:100],
        }
        for label, qs in plans.items():
            self.stdout.write(f"[{label}]\n" + qs.explain(analyze=True))
        start = time.perf_counter()
        jobs.attribute_purchases()
        self.stdout.write(f"nightly attribute_purchases      {(time.perf_counter() - start) * 1000:8.1f} ms")


def _schema_option(task):
    form = task.program.forms.get(status="published")
    return next(o for o in form.schema["outcomes"] if o["id"] == "o-yes")["fields"][0]["options"][0]["id"]
