from django.core.management.base import BaseCommand

from apps.pulse.sync import JOB_MATCH, match_due, run_job, run_match


class Command(BaseCommand):
    help = "Elinor Pulse: rebuild caption code -> product links from titles; cache product thumbnails."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Run only after a newer successful pulse_sync.")

    def handle(self, *args, **options):
        self.stdout.write(run_job(JOB_MATCH, run_match, if_due=options["if_due"], due=match_due))
