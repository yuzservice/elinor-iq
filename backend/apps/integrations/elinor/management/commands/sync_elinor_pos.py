from datetime import datetime, time

from django.core.management.base import BaseCommand, CommandError
from django.utils.dateparse import parse_date

from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService, clear_stuck_sync_runs
from apps.sales.models import PosSale, PosSaleItem


class Command(BaseCommand):
    help = "Sync physical-store POS sales from the Elinor mini_orders API."

    def add_arguments(self, parser):
        parser.add_argument(
            "--from",
            dest="from_date",
            help="Backfill start date (YYYY-MM-DD, inclusive). Requires --to.",
        )
        parser.add_argument(
            "--to",
            dest="to_date",
            help="Backfill end date (YYYY-MM-DD, inclusive). Requires --from.",
        )

    def handle(self, *args, **options):
        from_date = options.get("from_date")
        to_date = options.get("to_date")
        if bool(from_date) ^ bool(to_date):
            raise CommandError("Provide both --from and --to for a backfill window.")

        start_date = None
        end_date = None
        if from_date and to_date:
            start_date = parse_date(from_date)
            end_date = parse_date(to_date)
            if not start_date or not end_date:
                raise CommandError("Dates must be YYYY-MM-DD.")
            if start_date > end_date:
                raise CommandError("--from must be on or before --to.")

        cleared = clear_stuck_sync_runs(minutes=0)
        if cleared:
            self.stdout.write(self.style.WARNING(f"Cleared {cleared} stuck running sync job(s)."))
        service = SyncService(SyncRun.KIND_POS)
        run = service.execute_pos(start_date=start_date, end_date=end_date)
        report = run.report or {}
        self.stdout.write(self.style.SUCCESS("POS sync finished."))
        self.stdout.write(f"Status: {run.status}")
        self.stdout.write(f"Window: {run.window_start} → {run.window_end}")
        self.stdout.write(f"POS sales upserted: {report.get('pos_sales_upserted', 0)}")
        self.stdout.write(f"POS items upserted: {report.get('pos_items_upserted', 0)}")
        self.stdout.write(f"POS sales total: {PosSale.objects.count()}")
        self.stdout.write(f"POS items total: {PosSaleItem.objects.count()}")
        self.stdout.write(f"API requests: {run.requests_made}")
        if run.error_message:
            self.stdout.write(self.style.WARNING(run.error_message))
