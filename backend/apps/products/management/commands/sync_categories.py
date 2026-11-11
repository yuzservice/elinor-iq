from django.core.management.base import BaseCommand

from apps.products.categories import sync_from_payloads


class Command(BaseCommand):
    help = "Update categories and product links from stored product payloads (website data). Idempotent."

    def handle(self, *args, **options):
        self.stdout.write(f"sync_categories: {sync_from_payloads()}")
