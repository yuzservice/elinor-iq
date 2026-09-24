from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.metrics import REVENUE_STATUSES
from apps.customers.models import Customer
from apps.integrations.elinor.client import ElinorClient
from apps.integrations.elinor.models import SyncRun
from apps.integrations.elinor.parsers import extract_paginator, parse_datetime, unwrap_data
from apps.integrations.elinor.sync import SyncService, bootstrap_window
from apps.products.models import Product, Variant
from apps.sales.models import Order, OrderItem


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def admin_user(db):
    User = get_user_model()
    return User.objects.create_user(
        username="admin",
        password="secret-pass",
        role="admin",
        is_staff=True,
    )


@pytest.fixture
def auth_api(api, admin_user):
    api.force_login(admin_user)
    return api
