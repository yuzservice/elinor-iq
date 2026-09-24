from django.core.management.base import BaseCommand

from apps.integrations.elinor.gateway_payments import upsert_order_gateway_payments
from apps.sales.models import Order


class Command(BaseCommand):
    help = "Backfill DigiPay/SnappPay payments from stored order source_payload JSON."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=5000)
        parser.add_argument("--only-missing-details", action="store_true")

    def handle(self, *args, **options):
        qs = Order.objects.exclude(source_payload__isnull=True).order_by("-created_at")
        if options["only_missing_details"]:
            qs = qs.filter(details_synced_at__isnull=False)
        limit = max(1, options["limit"])
        total_rows = 0
        processed = 0
        for order in qs.iterator(chunk_size=200):
            if processed >= limit:
                break
            payload = order.source_payload
            if not isinstance(payload, dict):
                continue
            total_rows += upsert_order_gateway_payments(order, payload)
            processed += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Processed {processed} orders; upserted {total_rows} gateway payment rows."
            )
        )
