from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from apps.integrations.elinor.dump_import.load import load_extracted
from apps.integrations.elinor.dump_import.runner import DEFAULT_DUMP
from apps.integrations.elinor.dump_import.extract import extract_dump
from apps.sales.models import OnlinePayment


class Command(BaseCommand):
    help = "Import DigiPay/SnappPay gateway payments from CSV work dir or SQL dump."

    def add_arguments(self, parser):
        parser.add_argument(
            "--work-dir",
            default="/backups/elinor_gateway_import",
            help="CSV staging dir (must be visible inside the backend container)",
        )
        parser.add_argument(
            "--dump",
            default="/source/elinor_new13-septamber-2026.sql",
            help="SQL dump path inside the container; only gateway_payments rows are extracted",
        )
        parser.add_argument(
            "--from-dump",
            action="store_true",
            help="Extract digipay/snapppay rows from --dump, then load (does not re-import the full DB)",
        )
        parser.add_argument("--extract-only", action="store_true")

    def handle(self, *args, **options):
        work_dir = Path(options["work_dir"])
        work_dir.mkdir(parents=True, exist_ok=True)
        dump = (options["dump"] or "").strip()
        has_csv = (work_dir / "invoices.csv").exists() and (work_dir / "payments.csv").exists()

        if options["from_dump"] or (not has_csv and dump):
            if not dump:
                raise CommandError("Pass --dump or upload invoices.csv/payments.csv to --work-dir.")
            if not Path(dump).exists():
                raise CommandError(
                    f"Dump not found inside container: {dump}. "
                    "Place the file under /opt/elinor-iq/source on the host."
                )
            self.stdout.write(
                f"Extracting gateway_payments only from {dump} "
                "(this reads the dump file but does not re-import customers/orders/POS)…"
            )
            extract_dump(str(dump), str(work_dir), domains=["gateway_payments"], stdout=self.stdout)
            if options["extract_only"]:
                return
        elif not has_csv:
            raise CommandError(
                f"Missing CSV files in {work_dir}. Either:\n"
                "  1) copy invoices.csv/payments.csv to /opt/elinor-iq/backups/elinor_gateway_import on the host, or\n"
                "  2) run with --from-dump (uses /source/elinor_new13-septamber-2026.sql by default)"
            )

        self.stdout.write(f"Loading gateway_payments from {work_dir}…")
        load_extracted(str(work_dir), domains=["gateway_payments"], stdout=self.stdout)
        rows = list(
            OnlinePayment.objects.filter(status="success", invoice__status="success")
            .values("gateway")
            .annotate(count=Count("id"))
        )
        self.stdout.write(self.style.SUCCESS(f"Import finished. Success rows: {rows}"))
