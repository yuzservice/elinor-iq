import os

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Create or update the super admin used by the Ubuntu installer."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="")
        parser.add_argument("--password", default="")

    def handle(self, *args, **options):
        username = (options["username"] or os.environ.get("ELINOR_BOOTSTRAP_ADMIN_USERNAME") or "").strip()
        password = options["password"] or os.environ.get("ELINOR_BOOTSTRAP_ADMIN_PASSWORD") or ""
        if not username or not password:
            raise CommandError("Super admin username and password are required.")
        if len(password) < 8:
            raise CommandError("Super admin password must be at least 8 characters.")

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"role": User.ROLE_SUPER_ADMIN, "is_staff": True, "is_superuser": True},
        )
        user.role = User.ROLE_SUPER_ADMIN
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        verb = "created" if created else "updated"
        self.stdout.write(self.style.SUCCESS(f"Super admin '{username}' {verb}."))
