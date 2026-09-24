from django.core.management.base import BaseCommand

from apps.smart_direct.services import delete_expired_temporary_context


class Command(BaseCommand):
    help = "Delete expired Smart Direct temporary conversation context. Sessions and events are kept."

    def handle(self, *args, **options):
        deleted = delete_expired_temporary_context()
        self.stdout.write(
            self.style.SUCCESS(f"Deleted {deleted} expired temporary context row(s).")
        )
