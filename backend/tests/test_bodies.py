from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from cosmosx_backend.core.config import settings
from cosmosx_backend.db.seed import INITIAL_BODIES, seed_celestial_bodies
from cosmosx_backend.db.session import get_db
from cosmosx_backend.main import app


@pytest.fixture()
def db_session() -> Generator[Session]:
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
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


def test_list_bodies_empty(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/bodies")
    assert response.status_code == 200
    assert response.json() == []


def test_get_body_not_found(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/bodies/non-existent")
    assert response.status_code == 404
    assert response.json() == {"detail": "Body 'non-existent' not found"}


def test_seed_is_idempotent_and_queryable(
    db_session: Session,
    api_client: TestClient,
) -> None:
    first_insert = seed_celestial_bodies(db_session, commit=False)
    second_insert = seed_celestial_bodies(db_session, commit=False)

    assert first_insert == len(INITIAL_BODIES)
    assert second_insert == 0

    list_resp = api_client.get("/api/v1/bodies")
    assert list_resp.status_code == 200
    bodies = list_resp.json()
    assert len(bodies) == len(INITIAL_BODIES)

    earth_resp = api_client.get("/api/v1/bodies/earth")
    assert earth_resp.status_code == 200
    earth = earth_resp.json()
    assert earth["slug"] == "earth"
    assert earth["body_type"] == "planet"
    assert earth["parent_slug"] == "sun"
