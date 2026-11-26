import json
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from cosmosx_backend.core.config import settings
from cosmosx_backend.db.seed import seed_celestial_bodies, seed_telemetry_snapshots
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


def test_stream_endpoint_returns_404_for_unknown_body(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/bodies/unknown-craft/telemetry/stream?max_events=1")
    assert resp.status_code == 404


def test_stream_endpoint_emits_sse_telemetry_event(
    db_session: Session,
    api_client: TestClient,
) -> None:
    seed_celestial_bodies(db_session, commit=False)
    seed_telemetry_snapshots(db_session, commit=False)

    with api_client.stream(
        "GET",
        "/api/v1/bodies/earth/telemetry/stream?poll_interval_s=0.1&max_events=1",
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        lines = [line for line in resp.iter_lines() if line]

    assert "event: telemetry" in lines
    data_line = next(line for line in lines if line.startswith("data: "))
    payload = json.loads(data_line.removeprefix("data: "))
    assert payload["slug"] == "earth"
    assert payload["snapshot"]["velocity_kms"] == 29.78
