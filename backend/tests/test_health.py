from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from cosmosx_backend.core.config import settings
from cosmosx_backend.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == settings.app_name
    assert data["environment"] == settings.app_env


def test_health_db_endpoint() -> None:
    response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "cosmosx_dev",
        "user": "cosmosx_app",
    }


def test_test_database_connection() -> None:
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT current_database(), current_user")
            ).one()
        assert row == ("cosmosx_test", "cosmosx_migrator")
    finally:
        engine.dispose()
