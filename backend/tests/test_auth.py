import pytest


@pytest.mark.django_db
def test_login_logout_and_me(api, admin_user):
    denied = api.get("/api/auth/me/")
    assert denied.status_code in (401, 403)

    bad = api.post("/api/auth/login/", {"username": "admin", "password": "wrong"}, format="json")
    assert bad.status_code == 401

    ok = api.post("/api/auth/login/", {"username": "admin", "password": "secret-pass"}, format="json")
    assert ok.status_code == 200
    assert ok.data["username"] == "admin"
    assert ok.data["role"] == "admin"

    me = api.get("/api/auth/me/")
    assert me.status_code == 200
    assert me.data["username"] == "admin"

    api.post("/api/auth/logout/")
    after = api.get("/api/auth/me/")
    assert after.status_code in (401, 403)


@pytest.mark.django_db
def test_protected_home_requires_auth(api):
    response = api.get("/api/home/summary/")
    assert response.status_code in (401, 403)
