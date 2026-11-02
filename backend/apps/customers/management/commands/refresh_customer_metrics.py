from django.core.management.base import BaseCommand

from apps.customers.metrics import refresh_customer_metrics
from apps.customers.models import CustomerMetrics


class Command(BaseCommand):
    help = "Fill or refresh CustomerMetrics. The daily tier pass also refreshes it."

    def add_arguments(self, parser):
        parser.add_argument("--if-empty", action="store_true", help="First fill only: skip when the table has rows.")

    def handle(self, *args, **options):
        if options["if_empty"] and CustomerMetrics.objects.exists():
            return
        self.stdout.write(f"Customer metrics rows written: {refresh_customer_metrics()}")
