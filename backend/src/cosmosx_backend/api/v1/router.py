from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from cosmosx_backend.db.session import get_db
from cosmosx_backend.models.celestial import CelestialBody
from cosmosx_backend.schemas.celestial import CelestialBodyRead

router = APIRouter(prefix="/bodies", tags=["bodies"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[CelestialBodyRead])
def list_bodies(db: DbSession) -> list[CelestialBody]:
    stmt = select(CelestialBody).order_by(CelestialBody.id.asc())
    return list(db.scalars(stmt).all())


@router.get("/{slug}", response_model=CelestialBodyRead)
def get_body_by_slug(slug: str, db: DbSession) -> CelestialBody:
    stmt = select(CelestialBody).where(CelestialBody.slug == slug)
    body = db.scalar(stmt)
    if body is None:
        raise HTTPException(status_code=404, detail=f"Body '{slug}' not found")
    return body
