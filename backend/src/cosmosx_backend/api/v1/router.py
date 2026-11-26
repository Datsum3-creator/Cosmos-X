from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from cosmosx_backend.db.session import get_db
from cosmosx_backend.models.celestial import CelestialBody, TelemetrySnapshot
from cosmosx_backend.schemas.celestial import (
    CelestialBodyRead,
    TelemetrySnapshotCreate,
    TelemetrySnapshotRead,
    TelemetrySyncRequest,
    TelemetrySyncResponse,
)
from cosmosx_backend.services.horizons import fetch_horizons_state_vector

router = APIRouter(prefix="/bodies", tags=["bodies"])
DbSession = Annotated[Session, Depends(get_db)]
SnapshotLimit = Annotated[int, Query(ge=1, le=500)]


def _get_body_or_404(db: Session, slug: str) -> CelestialBody:
    body = db.scalar(select(CelestialBody).where(CelestialBody.slug == slug))
    if body is None:
        raise HTTPException(status_code=404, detail=f"Body '{slug}' not found")
    return body


@router.get("", response_model=list[CelestialBodyRead])
def list_bodies(db: DbSession) -> list[CelestialBody]:
    stmt = select(CelestialBody).order_by(CelestialBody.id.asc())
    return list(db.scalars(stmt).all())


@router.get("/{slug}", response_model=CelestialBodyRead)
def get_body_by_slug(slug: str, db: DbSession) -> CelestialBody:
    return _get_body_or_404(db, slug)


@router.get("/{slug}/telemetry", response_model=list[TelemetrySnapshotRead])
def list_body_telemetry(
    slug: str,
    db: DbSession,
    limit: SnapshotLimit = 25,
) -> list[TelemetrySnapshot]:
    body = _get_body_or_404(db, slug)
    stmt = (
        select(TelemetrySnapshot)
        .where(TelemetrySnapshot.body_id == body.id)
        .order_by(TelemetrySnapshot.epoch_utc.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.get("/{slug}/telemetry/latest", response_model=TelemetrySnapshotRead)
def get_latest_body_telemetry(
    slug: str,
    db: DbSession,
) -> TelemetrySnapshot:
    body = _get_body_or_404(db, slug)
    stmt = (
        select(TelemetrySnapshot)
        .where(TelemetrySnapshot.body_id == body.id)
        .order_by(TelemetrySnapshot.epoch_utc.desc())
        .limit(1)
    )
    snapshot = db.scalar(stmt)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail=f"No telemetry snapshots found for '{slug}'",
        )
    return snapshot


@router.post(
    "/{slug}/telemetry",
    response_model=TelemetrySnapshotRead,
    status_code=status.HTTP_201_CREATED,
)
def create_body_telemetry(
    slug: str,
    payload: TelemetrySnapshotCreate,
    db: DbSession,
) -> TelemetrySnapshot:
    body = _get_body_or_404(db, slug)
    snapshot = TelemetrySnapshot(
        body_id=body.id,
        epoch_utc=payload.epoch_utc,
        position_x_km=payload.position_x_km,
        position_y_km=payload.position_y_km,
        position_z_km=payload.position_z_km,
        velocity_kms=payload.velocity_kms,
    )
    db.add(snapshot)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Telemetry snapshot for '{slug}' at {payload.epoch_utc.isoformat()} already exists",
        ) from exc
    db.refresh(snapshot)
    return snapshot


@router.post(
    "/{slug}/telemetry/sync",
    response_model=TelemetrySyncResponse,
)
def sync_body_telemetry_from_horizons(
    slug: str,
    response: Response,
    db: DbSession,
    payload: TelemetrySyncRequest | None = None,
) -> TelemetrySyncResponse:
    body = _get_body_or_404(db, slug)
    requested_epoch = payload.epoch_utc if payload is not None else None

    try:
        vector = fetch_horizons_state_vector(slug, requested_epoch)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"JPL Horizons request failed for '{slug}': {type(exc).__name__}: {exc}",
        ) from exc

    if vector is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No JPL Horizons state vector available for '{slug}'",
        )

    existing = db.scalar(
        select(TelemetrySnapshot).where(
            TelemetrySnapshot.body_id == body.id,
            TelemetrySnapshot.epoch_utc == vector.epoch_utc,
        )
    )
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return TelemetrySyncResponse(
            created=False,
            source=vector.source,
            snapshot=existing,
        )

    snapshot = TelemetrySnapshot(
        body_id=body.id,
        epoch_utc=vector.epoch_utc,
        position_x_km=vector.position_x_km,
        position_y_km=vector.position_y_km,
        position_z_km=vector.position_z_km,
        velocity_kms=vector.velocity_kms,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    response.status_code = status.HTTP_201_CREATED
    return TelemetrySyncResponse(
        created=True,
        source=vector.source,
        snapshot=snapshot,
    )
