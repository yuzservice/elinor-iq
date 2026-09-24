from django.core.management.base import BaseCommand

from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService
from apps.sales.models import Order, PosSale


class Command(BaseCommand):
    help = "Run the hourly Elinor sync: recent online orders, online details, and POS sales."

    def handle(self, *args, **options):
        service = SyncService(SyncRun.KIND_HOURLY)
        run = service.execute_hourly()
        report = run.report or {}
        self.stdout.write(self.style.SUCCESS("Hourly sync finished."))
        self.stdout.write(f"Status: {run.status}")
        self.stdout.write(f"Online window: {run.window_start} → {run.window_end}")
        self.stdout.write(f"Online orders upserted: {run.orders_upserted}")
        self.stdout.write(f"Online items upserted: {run.items_upserted}")
        self.stdout.write(f"POS sales upserted: {report.get('pos_sales_upserted', 0)}")
        self.stdout.write(f"POS items upserted: {report.get('pos_items_upserted', 0)}")
        self.stdout.write(f"Orders total: {Order.objects.count()}")
        self.stdout.write(f"POS sales total: {PosSale.objects.count()}")
        self.stdout.write(f"API requests: {run.requests_made}")
        if run.error_message:
            self.stdout.write(self.style.WARNING(run.error_message))
