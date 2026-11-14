from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_SUPER_ADMIN = "super_admin"
    ROLE_ADMIN = "admin"
    ROLE_MANAGER = "manager"
    ROLE_ANALYST = "analyst"
    ROLE_STAFF = "staff"
    ROLE_SALES_AGENT = "sales_agent"
    ROLE_CONTENT = "content"  # Instagram team: Elinor Pulse only
    ROLE_SALES_STAFF = "sales_staff"  # like manager for reports, plus products on store racks; no settings
    ROLE_STORE_STAFF = "store_staff"  # in-store team: the store map only, read-only
    ROLE_CHOICES = [
        (ROLE_SUPER_ADMIN, "Super admin"),
        (ROLE_ADMIN, "Admin"),
        (ROLE_MANAGER, "Manager"),
        (ROLE_ANALYST, "Analyst"),
        (ROLE_STAFF, "Staff"),
        (ROLE_SALES_AGENT, "Sales agent"),
        (ROLE_CONTENT, "Content"),
        (ROLE_SALES_STAFF, "Sales staff"),
        (ROLE_STORE_STAFF, "Store staff"),
    ]

    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=ROLE_ADMIN)

    class Meta:
        db_table = "users"
