import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.integrations.elinor.models import SyncCursor
from apps.sales.daily_summary import refresh_daily_summary

CURSOR_KEY = "sales_daily_summary"


class Command(BaseCommand):
    help = "Rebuild sales_daily_summary (closed days × sales line) for the home page."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Skip when today's rebuild already finished.")

    def handle(self, *args, **options):
        today = timezone.localdate().isoformat()
        cursor = SyncCursor.objects.filter(key=CURSOR_KEY).first()
        if options["if_due"] and cursor and (cursor.value or {}).get("last_date") == today:
            self.stdout.write("sales_daily_summary: already built today")
            return
        started = time.monotonic()
        rows = refresh_daily_summary()
        SyncCursor.objects.update_or_create(key=CURSOR_KEY, defaults={"value": {"last_date": today, "rows": rows}})
        self.stdout.write(f"sales_daily_summary: {rows} rows in {time.monotonic() - started:.1f}s")
