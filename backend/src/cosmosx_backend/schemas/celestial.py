from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator


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


class TelemetrySnapshotCreate(BaseModel):
    epoch_utc: datetime
    position_x_km: float
    position_y_km: float
    position_z_km: float
    velocity_kms: float | None = None

    @field_validator("epoch_utc")
    @classmethod
    def normalize_utc_naive(cls, value: datetime) -> datetime:
        if value.tzinfo is not None:
            return value.astimezone(UTC).replace(tzinfo=None)
        return value


class TelemetrySnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body_id: int
    epoch_utc: datetime
    position_x_km: float
    position_y_km: float
    position_z_km: float
    velocity_kms: float | None
    created_at: datetime
