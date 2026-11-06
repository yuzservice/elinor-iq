from django.core.management.base import BaseCommand

from apps.pulse.sync import JOB_SNAPSHOT, run_job, run_snapshot, snapshot_due


class Command(BaseCommand):
    help = "Elinor Pulse: daily post snapshots and account followers/reach."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Run once per Tehran day, after 00:30.")

    def handle(self, *args, **options):
        self.stdout.write(run_job(JOB_SNAPSHOT, run_snapshot, if_due=options["if_due"], due=snapshot_due))
