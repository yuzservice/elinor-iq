from django.core.management.base import BaseCommand

from apps.pulse.sync import JOB_SYNC, run_job, run_sync, sync_due


class Command(BaseCommand):
    help = "Elinor Pulse: new posts and metrics of the last 30 days from Zernio, then covers."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Skip when the last success is under 3 hours old.")

    def handle(self, *args, **options):
        self.stdout.write(run_job(JOB_SYNC, run_sync, if_due=options["if_due"], due=sync_due))
