from datetime import date, timedelta
from django.core.management.base import BaseCommand, CommandError
from django.db.models import F
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.integrations.elinor.models import PosDaySync, SyncCursor
from apps.integrations.elinor.sync import COVERAGE_BRANCHES, POS_SQL_CUTOFF, branch_stored_count
from apps.sales.models import Order, PosSale


class Command(BaseCommand):
    help = (
        "Mark dump-imported POS days and online orders as synced in PosDaySync and SyncCursor "
        "so incremental API sync resumes exactly from the dump cutoff date without re-fetching historical data."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--cutoff-date",
            default="2026-11-22",
            help="Last day fully present in the SQL dump (YYYY-MM-DD, inclusive). Default: 2026-11-22.",
        )
        parser.add_argument(
            "--from-date",
            default=None,
            help=f"Start date for PosDaySync records (YYYY-MM-DD). Default: earliest POS sale or {POS_SQL_CUTOFF}.",
        )

    def handle(self, *args, **options):
        cutoff_str = options["cutoff_date"]
        cutoff_date = parse_date(cutoff_str)
        if not cutoff_date:
            raise CommandError("Invalid --cutoff-date format. Must be YYYY-MM-DD.")

        from_date_str = options.get("from_date")
        if from_date_str:
            from_date = parse_date(from_date_str)
            if not from_date:
                raise CommandError("Invalid --from-date format. Must be YYYY-MM-DD.")
        else:
            earliest_pos = PosSale.objects.order_by("created_at").values_list("created_at", flat=True).first()
            if earliest_pos:
                from_date = max(POS_SQL_CUTOFF, timezone.localtime(earliest_pos).date())
            else:
                from_date = POS_SQL_CUTOFF

        if from_date > cutoff_date:
            raise CommandError(f"--from-date ({from_date}) cannot be after --cutoff-date ({cutoff_date}).")

        self.stdout.write(f"Seeding POS day sync coverage from {from_date} to {cutoff_date}...")

        now = timezone.now()
        day = from_date
        records_marked = 0
        while day <= cutoff_date:
            for branch in COVERAGE_BRANCHES:
                stored = branch_stored_count(day, branch)
                PosDaySync.objects.update_or_create(
                    day=day,
                    branch=branch,
                    defaults={
                        "status": PosDaySync.STATUS_COMPLETE,
                        "api_count": stored,
                        "sales_upserted": stored,
                        "next_page": 1,
                        "completed_at": now,
                    },
                )
                records_marked += 1
            day += timedelta(days=1)

        self.stdout.write(
            self.style.SUCCESS(f"Marked {records_marked} PosDaySync records ({from_date}..{cutoff_date}) as COMPLETE.")
        )

        # Ensure all orders created up to cutoff have details_synced_at set
        orders_marked = Order.objects.filter(
            created_at__lte=timezone.make_aware(
                timezone.datetime.combine(cutoff_date, timezone.datetime.max.time()),
                timezone.get_current_timezone(),
            ),
            details_synced_at__isnull=True,
        ).update(details_synced_at=F("created_at"))
        if orders_marked:
            self.stdout.write(
                self.style.SUCCESS(f"Marked {orders_marked} legacy orders with details_synced_at.")
            )

        # Set pos_orders cursor so sync_elinor_pos resumes from cutoff
        cursor_pos, _ = SyncCursor.objects.get_or_create(key="pos_orders")
        cursor_pos.value = {
            "next_date": cutoff_date.isoformat(),
            "next_page": 1,
            "window_start": cutoff_date.isoformat(),
            "window_end": date.today().isoformat(),
        }
        cursor_pos.save()
        self.stdout.write(self.style.SUCCESS(f"Advanced 'pos_orders' cursor to {cutoff_date.isoformat()}."))

        # Set orders cursor to latest order created_at in dump
        last_order = Order.objects.filter(
            created_at__lte=timezone.make_aware(
                timezone.datetime.combine(cutoff_date, timezone.datetime.max.time()),
                timezone.get_current_timezone(),
            )
        ).order_by("-created_at").first()
        if last_order:
            cursor_orders, _ = SyncCursor.objects.get_or_create(key="orders")
            cursor_orders.value = {
                "last_created_at": last_order.created_at.isoformat(),
                "window_start": cutoff_date.isoformat(),
                "window_end": now.isoformat(),
            }
            cursor_orders.save()
            self.stdout.write(
                self.style.SUCCESS(f"Advanced 'orders' cursor to {last_order.created_at.isoformat()}.")
            )

        self.stdout.write(self.style.SUCCESS("All dump coverage marks and cursors seeded successfully."))
