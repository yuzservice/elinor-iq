from django.core.management.base import BaseCommand

from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService
from apps.customers.models import Customer
from apps.products.models import Product, Variant
from apps.sales.models import OrderItem


class Command(BaseCommand):
    help = "Refresh recent Elinor orders using an overlapping created_at window."

    def handle(self, *args, **options):
        service = SyncService(SyncRun.KIND_RECENT)
        run = service.execute()
        self.stdout.write(self.style.SUCCESS("Recent sync finished."))
        self.stdout.write(f"Status: {run.status}")
        self.stdout.write(f"Window: {run.window_start} → {run.window_end}")
        self.stdout.write(f"Orders upserted: {run.orders_upserted}")
        self.stdout.write(f"Customers stored: {Customer.objects.count()}")
        self.stdout.write(f"Order items stored: {OrderItem.objects.count()}")
        self.stdout.write(f"Products stored: {Product.objects.count()}")
        self.stdout.write(f"Variants stored: {Variant.objects.count()}")
        self.stdout.write(f"API requests: {run.requests_made}")
        if run.error_message:
            self.stdout.write(self.style.ERROR(run.error_message))
