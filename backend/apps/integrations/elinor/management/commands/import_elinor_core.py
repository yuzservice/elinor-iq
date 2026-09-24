from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.integrations.elinor.dump_import.mapping import DOMAINS
from apps.integrations.elinor.dump_import.runner import DEFAULT_DUMP, DEFAULT_WORK, run_core_import


class Command(BaseCommand):
    help = "Import core historical Elinor dump data into V2 PostgreSQL (idempotent upsert by source_id)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dump",
            default=DEFAULT_DUMP,
            help="Path to the MariaDB SQL dump",
        )
        parser.add_argument("--work-dir", default=DEFAULT_WORK)
        parser.add_argument("--only", help=f"One domain: {', '.join(DOMAINS)}")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--resume", action="store_true")

    def handle(self, *args, **options):
        dump = options["dump"]
        if not Path(dump).exists():
            raise CommandError(f"Dump not found: {dump}")
        only = [options["only"]] if options["only"] else None
        self.stdout.write(f"Dump: {dump}")
        self.stdout.write(f"Mode: {'dry-run' if options['dry_run'] else 'import'}")
        run = run_core_import(
            dump_path=dump,
            work_dir=options["work_dir"],
            only=only,
            dry_run=options["dry_run"],
            resume=options["resume"],
            stdout=self.stdout,
        )
        self.stdout.write(self.style.SUCCESS(f"ImportRun {run.id} {run.status} in {run.elapsed_seconds}s"))
        recon = (run.report or {}).get("audit", {}).get("reconciliation")
        if recon:
            for name, row in recon.items():
                self.stdout.write(f"  {name}: source={row.get('source')} imported={row.get('imported')} diff={row.get('difference')}")
        if run.report and run.report.get("extract_counts") and options["dry_run"]:
            for name, count in sorted(run.report["extract_counts"].items()):
                self.stdout.write(f"  {name}: {count}")
