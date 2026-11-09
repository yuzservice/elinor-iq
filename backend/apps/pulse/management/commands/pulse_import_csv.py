from django.core.management.base import BaseCommand

from apps.pulse.sync import JOB_IMPORT, import_csv, run_job


class Command(BaseCommand):
    help = "Elinor Pulse: one-time import of a Zernio posts CSV (idempotent on the post URL)."

    def add_arguments(self, parser):
        parser.add_argument("path")

    def handle(self, *args, **options):
        self.stdout.write(run_job(JOB_IMPORT, lambda: import_csv(options["path"])))
