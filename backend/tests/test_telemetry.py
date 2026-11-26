from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from cosmosx_backend.core.config import settings
from cosmosx_backend.db.seed import (
    INITIAL_TELEMETRY,
    seed_celestial_bodies,
    seed_telemetry_snapshots,
)
from cosmosx_backend.db.session import get_db
from cosmosx_backend.main import app


@pytest.fixture()
def db_session() -> Generator[Session]:
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()


@pytest.fixture()
def api_client(db_session: Session) -> Generator[TestClient]:
    def _override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def test_telemetry_for_missing_body_returns_404(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/bodies/pluto/telemetry")
    assert resp.status_code == 404


def test_latest_telemetry_when_empty_returns_404(
    db_session: Session,
    api_client: TestClient,
) -> None:
    seed_celestial_bodies(db_session, commit=False)
    resp = api_client.get("/api/v1/bodies/earth/telemetry/latest")
    assert resp.status_code == 404


def test_create_list_latest_and_conflict(
    db_session: Session,
    api_client: TestClient,
) -> None:
    seed_celestial_bodies(db_session, commit=False)

    older = {
        "epoch_utc": "2026-11-25T00:00:00Z",
        "position_x_km": 61000000.0,
        "position_y_km": 134000000.0,
        "position_z_km": -10000.0,
        "velocity_kms": 29.75,
    }
    newer = {
        "epoch_utc": "2026-11-26T12:00:00Z",
        "position_x_km": 64000000.0,
        "position_y_km": 133000000.0,
        "position_z_km": -12000.0,
        "velocity_kms": 29.81,
    }

    r1 = api_client.post("/api/v1/bodies/earth/telemetry", json=older)
    assert r1.status_code == 201
    r2 = api_client.post("/api/v1/bodies/earth/telemetry", json=newer)
    assert r2.status_code == 201

    duplicate = api_client.post("/api/v1/bodies/earth/telemetry", json=newer)
    assert duplicate.status_code == 409

    listing = api_client.get("/api/v1/bodies/earth/telemetry?limit=10")
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 2
    assert items[0]["epoch_utc"] == "2026-11-26T12:00:00"
    assert items[1]["epoch_utc"] == "2026-11-25T00:00:00"

    latest = api_client.get("/api/v1/bodies/earth/telemetry/latest")
    assert latest.status_code == 200
    assert latest.json()["velocity_kms"] == 29.81


def test_telemetry_seed_is_idempotent(
    db_session: Session,
    api_client: TestClient,
) -> None:
    seed_celestial_bodies(db_session, commit=False)
    first = seed_telemetry_snapshots(db_session, commit=False)
    second = seed_telemetry_snapshots(db_session, commit=False)

    assert first == len(INITIAL_TELEMETRY)
    assert second == 0

    voyager = api_client.get("/api/v1/bodies/voyager-1/telemetry/latest")
    assert voyager.status_code == 200
    assert voyager.json()["velocity_kms"] == 16.99
