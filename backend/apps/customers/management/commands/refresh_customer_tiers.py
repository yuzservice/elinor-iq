from django.core.management.base import BaseCommand, CommandError

from apps.customers.tier_refresh import refresh_due_tiers
from apps.customers.tiers import refresh_stored_tiers


class Command(BaseCommand):
    help = "Store customer tiers and refresh RFM. Without --force, a finished run today is skipped."

    def add_arguments(self, parser):
        parser.add_argument(
            "--if-due",
            action="store_true",
            help="Refresh only when today's pass has not finished.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Refresh every customer even if today's pass already finished.",
        )

    def handle(self, *args, **options):
        if options["force"]:
            updated = refresh_stored_tiers()
            from apps.customers.rfm import refresh_rfm_daily
            from apps.customers.tier_refresh import _finish

            # Same as the daily and manual paths: RFM (and internal-account signals) follow the tiers.
            rfm_ok = refresh_rfm_daily()
            _finish(success=True)
            self.stdout.write(self.style.SUCCESS(f"Stored tiers updated for {updated} customers."))
            self.stdout.write("RFM refreshed." if rfm_ok else "RFM refresh failed; see the customer_rfm status cursor.")
            return
        result = refresh_due_tiers()
        if result == "done":
            self.stdout.write(self.style.SUCCESS("Stored customer tiers refreshed."))
            return
        if result == "failed":
            raise CommandError("Customer tier refresh failed.")
        self.stdout.write("Customer tier refresh already done today.")
