from django.core.management.base import BaseCommand

from apps.products.stock import refresh_central_stock


class Command(BaseCommand):
    help = "Refresh central stock (main_balance) for products sold in the last 90 days, capped per run."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None)

    def handle(self, *args, **options):
        self.stdout.write(f"refresh_central_stock: {refresh_central_stock(limit=options['limit'])}")
