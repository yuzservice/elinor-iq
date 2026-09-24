from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Create the initial internal admin user."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--password", required=True)

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"]
        password = options["password"]
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"role": User.ROLE_ADMIN, "is_staff": True, "is_superuser": True},
        )
        user.role = User.ROLE_ADMIN
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()
        if created:
            self.stdout.write(self.style.SUCCESS(f"Admin '{username}' created."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Admin '{username}' updated."))
