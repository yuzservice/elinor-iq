from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.sync import clear_stuck_sync_runs


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
        if minutes:
            rows = list(
                SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING)
                .filter(started_at__lt=timezone.now() - timedelta(minutes=minutes))
                .values("id", "kind", "started_at")
            )
        else:
            rows = list(
                SyncRun.objects.filter(status=SyncRun.STATUS_RUNNING)
                .values("id", "kind", "started_at")
            )
        if not rows:
            self.stdout.write(self.style.SUCCESS("No running sync jobs to clear."))
            return
        for row in rows:
            self.stdout.write(
                f"Clearing run #{row['id']} kind={row['kind']} started={row['started_at']}"
            )
        updated = clear_stuck_sync_runs(minutes=minutes)
        self.stdout.write(self.style.SUCCESS(f"Cleared {updated} running sync job(s)."))
