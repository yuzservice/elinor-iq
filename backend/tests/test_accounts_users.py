from io import StringIO
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

PASSWORD = "Sara-Pulse-2026!"


def _check_content_login(username, settings):
    settings.PULSE_ENABLED = True
    client = APIClient()
    response = client.post("/api/auth/login/", {"username": username, "password": PASSWORD}, format="json")
    assert response.status_code == 200
    me = client.get("/api/auth/me/").json()
    assert me["role"] == "content" and me["features"] == {"pulse": True}
    for path in ("/api/sales/kpis/", "/api/customers/", "/api/products/"):
        assert client.get(path).status_code == 403, path
    assert client.get("/api/pulse/status/").status_code == 200


@pytest.mark.django_db
def test_create_user_command_prompts_for_the_password(settings, capsys):
    out, err = StringIO(), StringIO()
    with patch("getpass.getpass", side_effect=[PASSWORD, PASSWORD]):
        call_command("create_user", "--username", "sara", stdout=out, stderr=err)
    user = get_user_model().objects.get(username="sara")
    assert (user.role, user.is_staff, user.is_superuser) == ("content", False, False)
    captured = capsys.readouterr()
    assert PASSWORD not in out.getvalue() + err.getvalue() + captured.out + captured.err
    assert "sara" in out.getvalue()
    _check_content_login("sara", settings)


@pytest.mark.django_db
def test_create_user_rejects_mismatch_short_password_duplicates_and_unknown_role():
    with patch("getpass.getpass", side_effect=[PASSWORD, "other-password"]), pytest.raises(CommandError, match="do not match"):
        call_command("create_user", "--username", "a1")
    with patch("getpass.getpass", side_effect=["short", "short"]), pytest.raises(CommandError, match="Password rejected"):
        call_command("create_user", "--username", "a2")
    assert not get_user_model().objects.filter(username__in=["a1", "a2"]).exists()
    with patch("getpass.getpass", side_effect=[PASSWORD, PASSWORD]):
        call_command("create_user", "--username", "boss", "--role", "admin", stdout=StringIO())
    boss = get_user_model().objects.get(username="boss")
    assert boss.is_staff and not boss.is_superuser
    with pytest.raises(CommandError, match="already exists"):
        call_command("create_user", "--username", "boss")
    with pytest.raises(CommandError):
        call_command("create_user", "--username", "x", "--role", "owner")


@pytest.mark.django_db
def test_admin_creates_a_content_user_with_a_password(settings):
    admin_user = get_user_model().objects.create_superuser(username="root", password="Root-pass-123", role="super_admin")
    client = APIClient()
    client.force_login(admin_user)
    form = client.get("/admin/accounts/user/add/")
    assert form.status_code == 200 and b"password1" in form.content and b'name="role"' in form.content
    response = client.post(
        "/admin/accounts/user/add/",
        {"username": "mina", "role": "content", "password1": PASSWORD, "password2": PASSWORD, "usable_password": "true"},
    )
    assert response.status_code == 302, response.content[:500]
    mina = get_user_model().objects.get(username="mina")
    assert mina.role == "content" and mina.has_usable_password() and PASSWORD.encode() not in response.content
    change = client.get(f"/admin/accounts/user/{mina.pk}/change/")
    assert b"../password/" in change.content and PASSWORD.encode() not in change.content
    _check_content_login("mina", settings)


@pytest.mark.django_db
def test_admin_is_closed_to_content_and_sales_agent():
    for role in ("content", "sales_agent"):
        user = get_user_model().objects.create_user(username=f"u-{role}", password=PASSWORD, role=role)
        client = APIClient()
        client.force_login(user)
        assert client.get("/admin/accounts/user/add/").status_code in (302, 403)
