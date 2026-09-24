from django.core.management.base import BaseCommand

from apps.customers.models import Customer
from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import SyncService


class Command(BaseCommand):
    help = (
        "Paginated, resumable import of ALL Elinor customers via GET /admin/customers. "
        "Does not delete zero-order customers. Does not start automatically."
    )

    def handle(self, *args, **options):
        service = SyncService(SyncRun.KIND_CUSTOMERS)
        run = service.execute_customers()
        elapsed = ""
        if run.started_at and run.finished_at:
            elapsed = str(run.finished_at - run.started_at)
        self.stdout.write(self.style.SUCCESS("Customer sync finished."))
        self.stdout.write(f"Status: {run.status}")
        self.stdout.write(f"Customers upserted this run: {run.customers_upserted}")
        self.stdout.write(f"Customers stored: {Customer.objects.count()}")
        self.stdout.write(f"Purchasing customers: {Customer.objects.purchasing().count()}")
        self.stdout.write(f"Registered without orders: {Customer.objects.registered_only().count()}")
        self.stdout.write(f"API requests: {run.requests_made}")
        self.stdout.write(f"Elapsed: {elapsed}")
        if run.error_message:
            self.stdout.write(self.style.WARNING(run.error_message))
