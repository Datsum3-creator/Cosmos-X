import importlib
from collections.abc import Generator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from cosmosx_backend.core.config import settings
from cosmosx_backend.db.seed import seed_celestial_bodies
from cosmosx_backend.db.session import get_db
from cosmosx_backend.main import app
from cosmosx_backend.services.horizons import parse_horizons_vectors


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


def test_telemetry_limit_bounds_return_422(
    db_session: Session,
    api_client: TestClient,
) -> None:
    seed_celestial_bodies(db_session, commit=False)

    too_low = api_client.get("/api/v1/bodies/earth/telemetry?limit=0")
    assert too_low.status_code == 422

    too_high = api_client.get("/api/v1/bodies/earth/telemetry?limit=501")
    assert too_high.status_code == 422


def test_sync_endpoint_returns_502_on_horizons_network_error(
    db_session: Session,
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_celestial_bodies(db_session, commit=False)
    router_mod = importlib.import_module("cosmosx_backend.api.v1.router")

    def _raise_network_error(*args: object, **kwargs: object) -> None:
        raise OSError("JPL Horizons unreachable")

    monkeypatch.setattr(router_mod, "fetch_horizons_state_vector", _raise_network_error)

    resp = api_client.post("/api/v1/bodies/earth/telemetry/sync")
    assert resp.status_code == 502
    assert "JPL Horizons request failed" in resp.json()["detail"]


def test_sync_endpoint_returns_404_when_horizons_returns_none(
    db_session: Session,
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_celestial_bodies(db_session, commit=False)
    router_mod = importlib.import_module("cosmosx_backend.api.v1.router")

    monkeypatch.setattr(
        router_mod,
        "fetch_horizons_state_vector",
        lambda *args, **kwargs: None,
    )

    resp = api_client.post("/api/v1/bodies/earth/telemetry/sync")
    assert resp.status_code == 404
    assert "No JPL Horizons state vector available" in resp.json()["detail"]


def test_parse_horizons_vectors_returns_none_without_soe_block() -> None:
    result = parse_horizons_vectors("No ephemeris block here", datetime(2026, 11, 26, 0, 0, 0))
    assert result is None
