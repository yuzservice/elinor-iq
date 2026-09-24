from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_ADMIN = "admin"
    ROLE_MANAGER = "manager"
    ROLE_ANALYST = "analyst"
    ROLE_STAFF = "staff"
    ROLE_CHOICES = [
        (ROLE_ADMIN, "Admin"),
        (ROLE_MANAGER, "Manager"),
        (ROLE_ANALYST, "Analyst"),
        (ROLE_STAFF, "Staff"),
    ]

    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=ROLE_ADMIN)

    class Meta:
        db_table = "users"
