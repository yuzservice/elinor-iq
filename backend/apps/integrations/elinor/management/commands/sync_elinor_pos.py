from django.core.management.base import BaseCommand

from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService, clear_stuck_sync_runs
from apps.sales.models import PosSale, PosSaleItem


class Command(BaseCommand):
    help = "Sync physical-store POS sales from the Elinor mini_orders API."

    def handle(self, *args, **options):
        cleared = clear_stuck_sync_runs(minutes=0)
        if cleared:
            self.stdout.write(self.style.WARNING(f"Cleared {cleared} stuck running sync job(s)."))
        service = SyncService(SyncRun.KIND_POS)
        run = service.execute_pos()
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
