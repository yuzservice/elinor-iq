from datetime import datetime, time

from django.core.management.base import BaseCommand
from django.db.models import Count, Max
from django.utils import timezone

from apps.core.coverage import HISTORICAL_IMPORT_MAX_DATE, pos_sync_status
from apps.integrations.elinor.models import SyncCursor, SyncRun
from apps.integrations.elinor.sync import pos_window
from apps.sales.models import PosSale, PosSaleItem, SalesLine
from apps.sales.semantics import SALES_LINE_OVERVIEW_LABELS, qualifying_pos_items


class Command(BaseCommand):
    help = "Diagnose POS sync coverage by branch and highlight API backfill gaps."

    def handle(self, *args, **options):
        today = timezone.localdate()
        self.stdout.write(f"Historical SQL import through: {HISTORICAL_IMPORT_MAX_DATE.isoformat()}")
        self.stdout.write(f"Today (Tehran): {today.isoformat()}")
        self.stdout.write("")

        status = pos_sync_status()
        self.stdout.write("Branch coverage:")
        for row in status["by_line"]:
            lag = row["lag_days"]
            lag_text = "—" if lag is None else f"{lag} day(s) behind"
            self.stdout.write(
                f"  {row['label']}: count={row['count']} max_date={row['max_date'] or '—'} lag={lag_text}"
            )

        self.stdout.write("")
        cursor = SyncCursor.objects.filter(key="pos_orders").first()
        cursor_value = cursor.value if cursor else None
        start, end = pos_window(cursor_value)
        self.stdout.write(f"POS cursor (pos_orders): {cursor_value or '—'}")
        self.stdout.write(f"Next pos_window: {start.isoformat()} → {end.isoformat()}")

        self.stdout.write("")
        self.stdout.write("Recent POS sales after import cutoff:")
        cutoff = timezone.make_aware(
            datetime.combine(HISTORICAL_IMPORT_MAX_DATE, time.min),
            timezone.get_current_timezone(),
        )
        for line in (SalesLine.SARI, SalesLine.GORGAN, SalesLine.CAPRI):
            qs = PosSale.objects.filter(sales_line=line, created_at__gt=cutoff)
            count = qs.count()
            max_at = qs.aggregate(v=Max("created_at"))["v"]
            max_label = timezone.localtime(max_at).date().isoformat() if max_at else "—"
            self.stdout.write(f"  {SALES_LINE_OVERVIEW_LABELS[line]}: {count} sales, latest={max_label}")

        self.stdout.write("")
        headers_without_items = (
            PosSale.objects.filter(created_at__gt=cutoff)
            .annotate(item_count=Count("items"))
            .filter(item_count=0)
            .count()
        )
        orphan_items = PosSaleItem.objects.filter(pos_sale_id=None).count()
        self.stdout.write(f"POS headers without items (after cutoff): {headers_without_items}")
        self.stdout.write(f"Orphan POS items (pos_sale_id NULL): {orphan_items}")
        self.stdout.write(
            f"Qualifying POS item rows total: {qualifying_pos_items().count()}"
        )

        self.stdout.write("")
        latest_pos_run = SyncRun.objects.filter(kind=SyncRun.KIND_POS).order_by("-started_at").first()
        latest_hourly = SyncRun.objects.filter(kind=SyncRun.KIND_HOURLY).order_by("-started_at").first()
        running = list(
            SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING)
            .order_by("-started_at")
            .values("id", "kind", "started_at")
        )
        if running:
            self.stdout.write(self.style.WARNING("Running sync jobs (block new syncs):"))
            for row in running:
                self.stdout.write(
                    f"  #{row['id']} kind={row['kind']} started={row['started_at']}"
                )
            self.stdout.write(
                "Clear with: docker compose exec backend python manage.py clear_stuck_sync"
            )
            self.stdout.write("")
        for label, run in (("POS", latest_pos_run), ("Hourly", latest_hourly)):
            if not run:
                self.stdout.write(f"Last {label} sync: —")
                continue
            self.stdout.write(
                f"Last {label} sync: status={run.status} at={run.started_at} "
                f"window={run.window_start}→{run.window_end} "
                f"pos_sales={ (run.report or {}).get('pos_sales_upserted', 0) }"
            )

        self.stdout.write("")
        if status["needs_sync"]:
            self.stdout.write(self.style.WARNING("POS sync lag detected."))
            self.stdout.write("Suggested backfill:")
            self.stdout.write("  docker compose exec backend python manage.py sync_elinor_pos")
            self.stdout.write("Repeat until status=success and branch max_date reaches today.")
            self.stdout.write(
                "If needed, reset cursor to import cutoff then rerun:"
            )
            self.stdout.write(
                "  docker compose exec backend python manage.py shell -c "
                "\"from apps.integrations.elinor.models import SyncCursor; "
                "c,_=SyncCursor.objects.get_or_create(key='pos_orders'); "
                f"c.value={{'last_synced_date': '{HISTORICAL_IMPORT_MAX_DATE.isoformat()}'}}; c.save()\""
            )
        else:
            self.stdout.write(self.style.SUCCESS("POS branch dates look current."))
