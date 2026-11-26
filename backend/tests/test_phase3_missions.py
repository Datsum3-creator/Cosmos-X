from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from cosmosx_backend.core.config import settings
from cosmosx_backend.db.seed import seed_celestial_bodies, seed_telemetry_snapshots
from cosmosx_backend.db.session import get_db
from cosmosx_backend.main import app
from cosmosx_backend.services.horizons import HORIZONS_COMMAND_IDS

DEEP_SPACE_MISSIONS = (
    "voyager-1",
    "voyager-2",
    "new-horizons",
    "parker-solar-probe",
)


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


def test_deep_space_missions_mapped_in_horizons() -> None:
    assert HORIZONS_COMMAND_IDS["voyager-2"] == "-32"
    assert HORIZONS_COMMAND_IDS["new-horizons"] == "-98"
    assert HORIZONS_COMMAND_IDS["parker-solar-probe"] == "-96"


def test_deep_space_missions_seeded_and_queryable(
    db_session: Session,
    api_client: TestClient,
) -> None:
    seed_celestial_bodies(db_session, commit=False)
    seed_telemetry_snapshots(db_session, commit=False)

    for slug in DEEP_SPACE_MISSIONS:
        body_resp = api_client.get(f"/api/v1/bodies/{slug}")
        assert body_resp.status_code == 200
        assert body_resp.json()["body_type"] == "spacecraft"

        telemetry_resp = api_client.get(f"/api/v1/bodies/{slug}/telemetry/latest")
        assert telemetry_resp.status_code == 200
        assert telemetry_resp.json()["velocity_kms"] is not None
