from django.core.management.base import BaseCommand

from apps.pulse.covers import export_covers
from apps.pulse.sync import run_job


class Command(BaseCommand):
    help = "Elinor Pulse: export downloaded covers as <shortcode>.<ext> to a folder or a .tar.gz."

    def add_arguments(self, parser):
        parser.add_argument("target", help="Folder, or a path ending in .tar.gz")

    def handle(self, *args, **options):
        self.stdout.write(run_job("export_covers", lambda: export_covers(options["target"])))
