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
from cosmosx_backend.services.horizons import StateVector, parse_horizons_vectors


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


def test_parse_horizons_vectors_extracts_position_and_speed() -> None:
    sample_output = """
*******************************************************************************
$$SOE
2461370.500000000 = A.D. 2026-Nov-26 00:00:00.0000
 X = 6.358000000000000E+07 Y = 1.334500000000000E+08 Z =-1.250000000000000E+04
 VX=-2.690000000000000E+01 VY= 1.280000000000000E+01 VZ= 1.200000000000000E-03
$$EOE
*******************************************************************************
"""
    vec = parse_horizons_vectors(sample_output, datetime(2026, 11, 26, 0, 0, 0))
    assert vec is not None
    assert vec.epoch_utc == datetime(2026, 11, 26, 0, 0, 0)
    assert vec.position_x_km == pytest.approx(6.358e7)
    assert vec.velocity_kms is not None
    assert vec.velocity_kms == pytest.approx(29.79, rel=1e-2)


def test_sync_endpoint_creates_then_returns_idempotent_200(
    db_session: Session,
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_celestial_bodies(db_session, commit=False)
    router_mod = importlib.import_module("cosmosx_backend.api.v1.router")

    mock_vec = StateVector(
        epoch_utc=datetime(2026, 11, 26, 6, 0, 0),
        position_x_km=64100000.0,
        position_y_km=133200000.0,
        position_z_km=-11000.0,
        velocity_kms=29.8,
        source="jpl-horizons",
    )
    monkeypatch.setattr(
        router_mod,
        "fetch_horizons_state_vector",
        lambda *args, **kwargs: mock_vec,
    )

    first = api_client.post(
        "/api/v1/bodies/earth/telemetry/sync",
        json={"epoch_utc": "2026-11-26T06:00:00Z"},
    )
    assert first.status_code == 201
    assert first.json()["created"] is True
    assert first.json()["source"] == "jpl-horizons"

    second = api_client.post(
        "/api/v1/bodies/earth/telemetry/sync",
        json={"epoch_utc": "2026-11-26T06:00:00Z"},
    )
    assert second.status_code == 200
    assert second.json()["created"] is False


def test_sync_endpoint_returns_404_for_unknown_body(api_client: TestClient) -> None:
    resp = api_client.post("/api/v1/bodies/unknown-rock/telemetry/sync")
    assert resp.status_code == 404
