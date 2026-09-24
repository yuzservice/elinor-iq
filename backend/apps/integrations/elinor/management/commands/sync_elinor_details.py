from django.core.management.base import BaseCommand

from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem


class Command(BaseCommand):
    help = "Fetch order details for the most recent unsynced orders. Does not re-bootstrap light orders."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=500)

    def handle(self, *args, **options):
        limit = max(1, int(options["limit"]))
        service = SyncService(SyncRun.KIND_DETAILS)
        run = service.execute_details(limit=limit)
        elapsed = ""
        if run.started_at and run.finished_at:
            elapsed = str(run.finished_at - run.started_at)
        report = run.report or {}
        self.stdout.write(self.style.SUCCESS("Details sync finished."))
        self.stdout.write(f"Status: {run.status}")
        self.stdout.write(f"Detailed this run: {run.orders_upserted}")
        self.stdout.write(f"Detailed orders total: {report.get('detailed_orders')}")
        self.stdout.write(f"Items: {OrderItem.objects.count()}")
        self.stdout.write(f"Products: {Product.objects.count()}")
        self.stdout.write(f"Variants: {Variant.objects.count()}")
        self.stdout.write(f"Failures: {report.get('failures', 0)}")
        self.stdout.write(f"Retries: {report.get('retries', 0)}")
        self.stdout.write(f"Elapsed: {elapsed}")
        self.stdout.write(f"Orders unchanged: {Order.objects.count()}")
        if run.error_message:
            self.stdout.write(self.style.WARNING(run.error_message))
