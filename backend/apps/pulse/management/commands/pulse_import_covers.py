from django.core.management.base import BaseCommand

from apps.pulse.covers import import_covers
from apps.pulse.sync import run_job


class Command(BaseCommand):
    help = "Elinor Pulse: attach exported covers to posts by shortcode (skips unknown, never overwrites an ok file)."

    def add_arguments(self, parser):
        parser.add_argument("source", help="Folder or .tar.gz made by pulse_export_covers")

    def handle(self, *args, **options):
        self.stdout.write(run_job("import_covers", lambda: import_covers(options["source"])))
