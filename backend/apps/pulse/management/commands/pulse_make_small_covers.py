from django.core.management.base import BaseCommand

from apps.pulse.covers import make_missing_small_covers
from apps.pulse.sync import run_job


class Command(BaseCommand):
    help = "Elinor Pulse: create the 600 px list copy for every downloaded cover that has none (idempotent)."

    def handle(self, *args, **options):
        self.stdout.write(run_job("small_covers", make_missing_small_covers))
