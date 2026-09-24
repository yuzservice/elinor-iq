import pytest
from django.contrib.auth import get_user_model

from apps.integrations.elinor.client import current_elinor_credentials
from apps.integrations.elinor.models import ElinorApiConfig


@pytest.fixture
def super_admin(db):
    User = get_user_model()
    return User.objects.create_user(
        username="root",
        password="secret-pass",
        role=User.ROLE_SUPER_ADMIN,
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def super_api(api, super_admin):
    api.force_login(super_admin)
    return api


@pytest.mark.django_db
def test_layer_two_admin_cannot_manage_platform(auth_api):
    assert auth_api.get("/api/auth/me/").data["can_manage_platform"] is False
    status = auth_api.get("/api/system/status/")
    assert status.status_code == 200
    assert "username" not in status.data["api"]
    assert auth_api.put("/api/system/api-config/", {"username": "api-user", "password": "secret"}, format="json").status_code == 403
    assert auth_api.post("/api/system/admins/", {"username": "second", "password": "secret-pass"}, format="json").status_code == 403


@pytest.mark.django_db
def test_super_admin_saves_api_and_creates_layer_two_admin(super_api):
    saved = super_api.put(
        "/api/system/api-config/",
        {"base_url": "https://api.elinorboutique.com/v1", "username": "shop", "password": "api-secret"},
        format="json",
    )
    assert saved.status_code == 200
    assert current_elinor_credentials()[1:] == ("shop", "api-secret")

    created = super_api.post(
        "/api/system/admins/",
        {"username": "cashier", "password": "secret-pass"},
        format="json",
    )
    assert created.status_code == 201
    assert created.data["role"] == "admin"

    listed = super_api.get("/api/system/admins/")
    roles = {row["username"]: row["role"] for row in listed.data["results"]}
    assert roles["cashier"] == "admin"
    assert roles["root"] == "super_admin"

    status = super_api.get("/api/system/status/")
    assert status.data["api"]["username"] == "shop"
    assert status.data["api"]["password_set"] is True
    assert "api-secret" not in str(status.data)


@pytest.mark.django_db
def test_blank_api_password_keeps_the_saved_one(super_api):
    ElinorApiConfig.objects.create(pk=1, username="shop", password="kept-secret", base_url="https://api.elinorboutique.com/v1")
    response = super_api.put(
        "/api/system/api-config/",
        {"base_url": "https://api.elinorboutique.com/v1", "username": "shop", "password": ""},
        format="json",
    )
    assert response.status_code == 200
    assert ElinorApiConfig.objects.get(pk=1).password == "kept-secret"
