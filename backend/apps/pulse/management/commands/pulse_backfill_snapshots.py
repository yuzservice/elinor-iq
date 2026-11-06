from django.core.management.base import BaseCommand

from apps.pulse.backfill import backfill_due, run_backfill
from apps.pulse.sync import run_job


class Command(BaseCommand):
    help = "Elinor Pulse: fill missing first-30-day snapshots from Zernio post-timeline (never replaces our own)."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Run once per Tehran day.")

    def handle(self, *args, **options):
        self.stdout.write(run_job("backfill", run_backfill, if_due=options["if_due"], due=backfill_due))
