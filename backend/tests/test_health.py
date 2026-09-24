import pytest
from django.db import connection


@pytest.mark.django_db
def test_postgres_is_connected():
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        assert cursor.fetchone()[0] == 1


@pytest.mark.django_db
def test_health_endpoint(api):
    response = api.get("/api/health/")
    assert response.status_code == 200
    assert response.data["postgres"] is True
    assert response.data["status"] == "ok"
