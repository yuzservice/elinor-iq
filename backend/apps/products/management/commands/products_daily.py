from django.core.management.base import BaseCommand

from apps.products.daily import run_daily


class Command(BaseCommand):
    help = "Daily products pass: category sync, daily sales, bundles and metrics."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Skip when today's pass already finished.")

    def handle(self, *args, **options):
        self.stdout.write(f"products_daily: {run_daily(if_due=options['if_due'])}")
