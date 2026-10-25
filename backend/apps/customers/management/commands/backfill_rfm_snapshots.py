from django.core.management.base import BaseCommand

from apps.customers.rfm import backfill_snapshots


class Command(BaseCommand):
    help = "Build monthly RFM snapshots for past Jalali months. Existing months are skipped."

    def add_arguments(self, parser):
        parser.add_argument("--months", type=int, default=12, help="Number of complete Jalali months to build.")

    def handle(self, *args, **options):
        months = max(1, min(options["months"], 60))
        for month, written in backfill_snapshots(months).items():
            self.stdout.write(f"{month}: {'skipped (exists)' if written is None else f'{written} customers'}")
