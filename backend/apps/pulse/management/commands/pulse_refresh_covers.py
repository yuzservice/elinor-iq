from django.core.management.base import BaseCommand

from apps.pulse.sync import JOB_COVERS, cover_refresh_due, run_cover_refresh, run_job


class Command(BaseCommand):
    help = "Elinor Pulse: daily fresh cover URLs (single-post reads) for posts outside the 30-day sync window."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Run once per Tehran day.")

    def handle(self, *args, **options):
        self.stdout.write(run_job(JOB_COVERS, run_cover_refresh, if_due=options["if_due"], due=cover_refresh_due))
