from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CelestialBodyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    body_type: str
    parent_slug: str | None
    radius_km: float | None
    orbital_period_days: float | None
    ephemeris_source: str
    created_at: datetime
