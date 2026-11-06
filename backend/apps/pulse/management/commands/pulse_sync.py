from django.core.management.base import BaseCommand

from apps.pulse.rules import FULL_REFRESH_DAYS
from apps.pulse.sync import JOB_SYNC, POST_WINDOW_DAYS, run_job, run_sync, sync_due


class Command(BaseCommand):
    help = "Elinor Pulse: new posts and metrics of the last 30 days from Zernio, then covers."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Skip when the last success is under 3 hours old.")
        parser.add_argument("--full", action="store_true", help="One-off: read the last 90 days instead of 30 (idempotent).")

    def handle(self, *args, **options):
        days = FULL_REFRESH_DAYS if options["full"] else POST_WINDOW_DAYS
        self.stdout.write(run_job(JOB_SYNC, lambda: run_sync(days=days), if_due=options["if_due"], due=sync_due))
