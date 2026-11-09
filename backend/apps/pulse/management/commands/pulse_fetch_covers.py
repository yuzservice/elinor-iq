from django.core.management.base import BaseCommand

from apps.pulse import media
from apps.pulse.models import IgMediaAsset
from apps.pulse.sync import JOB_FETCH_COVERS, run_job


class Command(BaseCommand):
    help = "Elinor Pulse: download every pending cover now through the relay (at most 2 per second)."

    def handle(self, *args, **options):
        def work():
            ok, failed, waiting = media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", limit=None)
            return {"covers_ok": ok, "covers_failed": failed, "covers_waiting": waiting, "relay": media.relay_configured()}

        self.stdout.write(run_job(JOB_FETCH_COVERS, work))
