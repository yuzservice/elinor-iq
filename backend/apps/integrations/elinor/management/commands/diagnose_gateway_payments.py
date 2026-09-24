from pathlib import Path

from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.integrations.elinor.gateway_payments import extract_order_payment_rows
from apps.sales.models import OnlineInvoice, OnlinePayment, Order


class Command(BaseCommand):
    help = "Diagnose online gateway payment import/sync state."

    def handle(self, *args, **options):
        sql_path = Path("/source/elinor_new13-septamber-2026.sql")
        csv_dir = Path("/tmp/elinor_gateway_import")
        self.stdout.write(f"SQL dump present: {sql_path.exists()} ({sql_path})")
        self.stdout.write(
            f"Gateway CSV dir: {csv_dir.exists()} "
            f"invoices={ (csv_dir / 'invoices.csv').exists() } "
            f"payments={ (csv_dir / 'payments.csv').exists() }"
        )
        self.stdout.write(f"OnlineInvoice rows: {OnlineInvoice.objects.count()}")
        self.stdout.write(f"OnlinePayment rows: {OnlinePayment.objects.count()}")
        success = OnlinePayment.objects.filter(status="success", invoice__status="success")
        for row in success.values("gateway").annotate(count=Count("id")).order_by("gateway"):
            self.stdout.write(f"  success {row['gateway']}: {row['count']}")
        self.stdout.write(f"Orders total: {Order.objects.count()}")
        self.stdout.write(f"Orders with source_payload: {Order.objects.exclude(source_payload__isnull=True).count()}")
        self.stdout.write(f"Orders with details_synced_at: {Order.objects.exclude(details_synced_at__isnull=True).count()}")

        sample = (
            Order.objects.exclude(details_synced_at__isnull=True)
            .exclude(source_payload__isnull=True)
            .order_by("-created_at")
            .first()
        )
        if sample:
            payload = sample.source_payload or {}
            keys = sorted(payload.keys()) if isinstance(payload, dict) else []
            self.stdout.write(f"Latest detailed order {sample.source_id} payload keys: {keys[:25]}")
            rows = extract_order_payment_rows(sample.source_id, payload)
            self.stdout.write(f"Latest detailed order extract rows: {len(rows)}")

        light = Order.objects.exclude(source_payload__isnull=True).order_by("-created_at").first()
        if light:
            payload = light.source_payload or {}
            keys = sorted(payload.keys()) if isinstance(payload, dict) else []
            self.stdout.write(f"Latest any order {light.source_id} payload keys: {keys[:25]}")
            rows = extract_order_payment_rows(light.source_id, payload)
            self.stdout.write(f"Latest any order extract rows: {len(rows)}")
