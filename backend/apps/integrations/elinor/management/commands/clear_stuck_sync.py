from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.integrations.elinor.models import SyncRun


class Command(BaseCommand):
    help = "Mark stuck running sync jobs as failed so a new sync can start."

    def add_arguments(self, parser):
        parser.add_argument(
            "--minutes",
            type=int,
            default=0,
            help="Only clear runs older than N minutes (default: 0 = clear all running).",
        )

    def handle(self, *args, **options):
        minutes = max(0, int(options["minutes"]))
        qs = SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING)
        if minutes:
            cutoff = timezone.now() - timedelta(minutes=minutes)
            qs = qs.filter(started_at__lt=cutoff)
        rows = list(qs.values("id", "kind", "started_at"))
        if not rows:
            self.stdout.write(self.style.SUCCESS("No running sync jobs to clear."))
            return
        for row in rows:
            self.stdout.write(
                f"Clearing run #{row['id']} kind={row['kind']} started={row['started_at']}"
            )
        updated = qs.update(
            status=SyncRun.STATUS_FAILED,
            finished_at=timezone.now(),
            error_message="Cleared by clear_stuck_sync.",
        )
        self.stdout.write(self.style.SUCCESS(f"Cleared {updated} running sync job(s)."))
