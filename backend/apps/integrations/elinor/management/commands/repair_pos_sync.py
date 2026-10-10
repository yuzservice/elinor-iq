from django.core.management.base import BaseCommand

from apps.integrations.elinor.sync import repair_mismatched_pos_day_syncs


class Command(BaseCommand):
    help = "Repair POS day sync coverage records where api_count was truncated due to resumed partial syncs."

    def handle(self, *args, **options):
        self.stdout.write("Checking and repairing mismatched POS day sync records...")
        repaired = repair_mismatched_pos_day_syncs()
        if repaired:
            self.stdout.write(
                self.style.SUCCESS(f"Successfully repaired {repaired} POS day sync record(s).")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS("No mismatched records found to repair.")
            )
