import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()
ROLES = [code for code, _label in User.ROLE_CHOICES]
STAFF_ROLES = {User.ROLE_SUPER_ADMIN, User.ROLE_ADMIN}  # the roles that may open /admin/


class Command(BaseCommand):
    help = "Create one user with a role (default: content). The password is asked interactively, never as an argument."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--role", default=User.ROLE_CONTENT, choices=ROLES)

    def handle(self, *args, **options):
        username = options["username"].strip()
        role = options["role"]
        if not username:
            raise CommandError("Username is required.")
        if User.objects.filter(username=username).exists():
            raise CommandError(f"User '{username}' already exists. Change it in /admin/ instead.")
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Password (again): "):
            raise CommandError("The two passwords do not match. Nothing was created.")
        user = User(username=username, role=role, is_staff=role in STAFF_ROLES, is_superuser=role == User.ROLE_SUPER_ADMIN)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError("Password rejected: " + " ".join(exc.messages)) from None
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"User '{username}' created with role '{role}'."))
