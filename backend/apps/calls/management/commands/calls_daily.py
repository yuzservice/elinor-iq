from django.core.management.base import BaseCommand

from apps.calls.jobs import run_daily


class Command(BaseCommand):
    help = "Nightly Call Center job: purchase attribution and dynamic lists."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Skip when today's pass already finished.")

    def handle(self, *args, **options):
        self.stdout.write(run_daily(if_due=options["if_due"]))
