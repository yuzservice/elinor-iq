from django.core.management.base import BaseCommand

from apps.pulse.brief import brief_due, run_daily_brief
from apps.pulse.sync import run_job


class Command(BaseCommand):
    help = "Elinor Pulse: rule-based morning brief and up to 3 tasks for today (after 08:00 Tehran)."

    def add_arguments(self, parser):
        parser.add_argument("--if-due", action="store_true", help="Skip before 08:00 Tehran or when today's brief exists.")
        parser.add_argument("--force", action="store_true", help="Rebuild today's brief and tasks (resets ticks).")

    def handle(self, *args, **options):
        self.stdout.write(run_job("daily_brief", lambda: run_daily_brief(force=options["force"]), if_due=options["if_due"], due=brief_due))
