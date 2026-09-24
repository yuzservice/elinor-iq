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
        parser.add_argument("--work-dir", default="/tmp/elinor_gateway_import")
        parser.add_argument("--dump", default="", help="Optional full SQL dump path for extract")
        parser.add_argument("--extract-only", action="store_true")

    def handle(self, *args, **options):
        work_dir = Path(options["work_dir"])
        work_dir.mkdir(parents=True, exist_ok=True)
        dump = options["dump"]
        if dump:
            if not Path(dump).exists():
                raise CommandError(f"Dump not found: {dump}")
            self.stdout.write(f"Extracting gateway_payments from {dump}…")
            extract_dump(str(dump), str(work_dir), domains=["gateway_payments"], stdout=self.stdout)
            if options["extract_only"]:
                return
        elif not (work_dir / "invoices.csv").exists() or not (work_dir / "payments.csv").exists():
            raise CommandError(
                f"Missing CSV files in {work_dir}. Upload invoices.csv/payments.csv or pass --dump."
            )

        self.stdout.write(f"Loading gateway_payments from {work_dir}…")
        load_extracted(str(work_dir), domains=["gateway_payments"], stdout=self.stdout)
        rows = list(
            OnlinePayment.objects.filter(status="success", invoice__status="success")
            .values("gateway")
            .annotate(count=Count("id"))
        )
        self.stdout.write(self.style.SUCCESS(f"Import finished. Success rows: {rows}"))
