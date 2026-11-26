import asyncio
import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from cosmosx_backend.db.session import SessionLocal, get_db
from cosmosx_backend.models.celestial import CelestialBody, TelemetrySnapshot
from cosmosx_backend.schemas.celestial import (
    CelestialBodyRead,
    TelemetrySnapshotCreate,
    TelemetrySnapshotRead,
    TelemetrySyncRequest,
    TelemetrySyncResponse,
)
from cosmosx_backend.services.horizons import fetch_horizons_state_vector

router = APIRouter(tags=["celestial"])
DbSession = Annotated[Session, Depends(get_db)]


def _get_body_or_404(db: Session, slug: str) -> CelestialBody:
    body = db.scalar(select(CelestialBody).where(CelestialBody.slug == slug))
    if body is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Body '{slug}' not found",
        )
    return body


def _latest_snapshot_for_body(db: Session, body_id: int) -> TelemetrySnapshot | None:
    stmt = (
        select(TelemetrySnapshot)
        .where(TelemetrySnapshot.body_id == body_id)
        .order_by(desc(TelemetrySnapshot.epoch_utc), desc(TelemetrySnapshot.id))
        .limit(1)
    )
    return db.scalar(stmt)


@router.get("/bodies", response_model=list[CelestialBodyRead])
def list_bodies(db: DbSession) -> list[CelestialBody]:
    stmt = select(CelestialBody).order_by(CelestialBody.id.asc())
    return list(db.scalars(stmt).all())


@router.get("/bodies/{slug}", response_model=CelestialBodyRead)
def get_body(slug: str, db: DbSession) -> CelestialBody:
    return _get_body_or_404(db, slug)


@router.get(
    "/bodies/{slug}/telemetry",
    response_model=list[TelemetrySnapshotRead],
)
def list_body_telemetry(
    slug: str,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> list[TelemetrySnapshot]:
    body = _get_body_or_404(db, slug)
    stmt = (
        select(TelemetrySnapshot)
        .where(TelemetrySnapshot.body_id == body.id)
        .order_by(desc(TelemetrySnapshot.epoch_utc), desc(TelemetrySnapshot.id))
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.get(
    "/bodies/{slug}/telemetry/latest",
    response_model=TelemetrySnapshotRead,
)
def get_latest_body_telemetry(
    slug: str,
    db: DbSession,
) -> TelemetrySnapshot:
    body = _get_body_or_404(db, slug)
    snapshot = _latest_snapshot_for_body(db, body.id)
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No telemetry snapshots found for body '{slug}'",
        )
    return snapshot


@router.get("/bodies/{slug}/telemetry/stream")
async def stream_body_telemetry(
    slug: str,
    db: DbSession,
    poll_interval_s: Annotated[float, Query(ge=0.1, le=30.0)] = 2.0,
    max_events: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> StreamingResponse:
    body = _get_body_or_404(db, slug)
    body_id = body.id

    async def event_generator():
        emitted = 0
        last_signature: tuple[int, str] | None = None

        while max_events is None or emitted < max_events:
            with SessionLocal() as stream_db:
                latest = _latest_snapshot_for_body(stream_db, body_id)
            if latest is None:
                latest = _latest_snapshot_for_body(db, body_id)

            if latest is not None:
                payload_obj = TelemetrySnapshotRead.model_validate(latest).model_dump(mode="json")
                sig = (latest.id, payload_obj["epoch_utc"])
                if sig != last_signature:
                    last_signature = sig
                    emitted += 1
                    data = json.dumps({"slug": slug, "snapshot": payload_obj})
                    yield f"event: telemetry\ndata: {data}\n\n"
                else:
                    yield ": heartbeat\n\n"
            else:
                if last_signature is None:
                    last_signature = (-1, "")
                    emitted += 1
                    data = json.dumps({"slug": slug, "snapshot": None})
                    yield f"event: telemetry\ndata: {data}\n\n"
                else:
                    yield ": heartbeat\n\n"

            if max_events is not None and emitted >= max_events:
                break

            await asyncio.sleep(poll_interval_s)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/bodies/{slug}/telemetry",
    response_model=TelemetrySnapshotRead,
    status_code=status.HTTP_201_CREATED,
)
def create_body_telemetry(
    slug: str,
    payload: TelemetrySnapshotCreate,
    db: DbSession,
) -> TelemetrySnapshot:
    body = _get_body_or_404(db, slug)
    epoch_naive = (
        payload.epoch_utc.astimezone().replace(tzinfo=None)
        if payload.epoch_utc.tzinfo is not None
        else payload.epoch_utc
    )

    snapshot = TelemetrySnapshot(
        body_id=body.id,
        epoch_utc=epoch_naive,
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
            detail=(
                f"Telemetry snapshot for body '{slug}' at epoch "
                f"'{epoch_naive.isoformat()}' already exists"
            ),
        ) from exc

    db.refresh(snapshot)
    return snapshot


@router.post(
    "/bodies/{slug}/telemetry/sync",
    response_model=TelemetrySyncResponse,
)
def sync_body_telemetry(
    slug: str,
    db: DbSession,
    payload: TelemetrySyncRequest | None = None,
    response: Response = None,  # type: ignore[assignment]
) -> TelemetrySyncResponse:
    body = _get_body_or_404(db, slug)
    requested_epoch: datetime | None = payload.epoch_utc if payload else None

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
        if response is not None:
            response.status_code = status.HTTP_200_OK
        return TelemetrySyncResponse(
            created=False,
            source=vector.source,
            snapshot=TelemetrySnapshotRead.model_validate(existing),
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
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        race_existing = db.scalar(
            select(TelemetrySnapshot).where(
                TelemetrySnapshot.body_id == body.id,
                TelemetrySnapshot.epoch_utc == vector.epoch_utc,
            )
        )
        if race_existing is not None:
            if response is not None:
                response.status_code = status.HTTP_200_OK
            return TelemetrySyncResponse(
                created=False,
                source=vector.source,
                snapshot=TelemetrySnapshotRead.model_validate(race_existing),
            )
        raise

    db.refresh(snapshot)
    if response is not None:
        response.status_code = status.HTTP_201_CREATED
    return TelemetrySyncResponse(
        created=True,
        source=vector.source,
        snapshot=TelemetrySnapshotRead.model_validate(snapshot),
    )
