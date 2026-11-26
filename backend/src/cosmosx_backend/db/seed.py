from datetime import datetime
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session

from cosmosx_backend.db.session import SessionLocal
from cosmosx_backend.models.celestial import CelestialBody, TelemetrySnapshot


class BodySeed(TypedDict):
    slug: str
    name: str
    body_type: str
    parent_slug: str | None
    radius_km: float | None
    orbital_period_days: float | None
    ephemeris_source: str


class TelemetrySeed(TypedDict):
    slug: str
    epoch_utc: datetime
    position_x_km: float
    position_y_km: float
    position_z_km: float
    velocity_kms: float | None


REFERENCE_EPOCH = datetime(2026, 11, 26, 0, 0, 0)

INITIAL_BODIES: list[BodySeed] = [
    {
        "slug": "sun",
        "name": "Sun",
        "body_type": "star",
        "parent_slug": None,
        "radius_km": 696340.0,
        "orbital_period_days": None,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "mercury",
        "name": "Mercury",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 2439.7,
        "orbital_period_days": 87.97,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "venus",
        "name": "Venus",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 6051.8,
        "orbital_period_days": 224.7,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "earth",
        "name": "Earth",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 6371.0,
        "orbital_period_days": 365.256,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "moon",
        "name": "Moon",
        "body_type": "moon",
        "parent_slug": "earth",
        "radius_km": 1737.4,
        "orbital_period_days": 27.322,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "mars",
        "name": "Mars",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 3389.5,
        "orbital_period_days": 686.98,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "jupiter",
        "name": "Jupiter",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 69911.0,
        "orbital_period_days": 4332.59,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "saturn",
        "name": "Saturn",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 58232.0,
        "orbital_period_days": 10759.22,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "uranus",
        "name": "Uranus",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 25362.0,
        "orbital_period_days": 30688.5,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "neptune",
        "name": "Neptune",
        "body_type": "planet",
        "parent_slug": "sun",
        "radius_km": 24622.0,
        "orbital_period_days": 60182.0,
        "ephemeris_source": "j2000-seed",
    },
    {
        "slug": "voyager-1",
        "name": "Voyager 1",
        "body_type": "spacecraft",
        "parent_slug": "sun",
        "radius_km": None,
        "orbital_period_days": None,
        "ephemeris_source": "horizons-seed",
    },
]

INITIAL_TELEMETRY: list[TelemetrySeed] = [
    {
        "slug": "sun",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": 0.0,
        "position_y_km": 0.0,
        "position_z_km": 0.0,
        "velocity_kms": 0.0,
    },
    {
        "slug": "mercury",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": 53280000.0,
        "position_y_km": 22540000.0,
        "position_z_km": 2890000.0,
        "velocity_kms": 47.36,
    },
    {
        "slug": "venus",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": -13920000.0,
        "position_y_km": 107300000.0,
        "position_z_km": 3180000.0,
        "velocity_kms": 35.02,
    },
    {
        "slug": "earth",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": 63580000.0,
        "position_y_km": 133450000.0,
        "position_z_km": -12500.0,
        "velocity_kms": 29.78,
    },
    {
        "slug": "moon",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": 63850000.0,
        "position_y_km": 133720000.0,
        "position_z_km": 22100.0,
        "velocity_kms": 1.022,
    },
    {
        "slug": "mars",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": -131200000.0,
        "position_y_km": 186400000.0,
        "position_z_km": 6920000.0,
        "velocity_kms": 24.07,
    },
    {
        "slug": "jupiter",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": -483500000.0,
        "position_y_km": 610200000.0,
        "position_z_km": 11400000.0,
        "velocity_kms": 13.07,
    },
    {
        "slug": "saturn",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": 1368000000.0,
        "position_y_km": 389500000.0,
        "position_z_km": -61200000.0,
        "velocity_kms": 9.68,
    },
    {
        "slug": "uranus",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": 1451000000.0,
        "position_y_km": 2520000000.0,
        "position_z_km": -18600000.0,
        "velocity_kms": 6.80,
    },
    {
        "slug": "neptune",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": 4467000000.0,
        "position_y_km": 189000000.0,
        "position_z_km": -108500000.0,
        "velocity_kms": 5.43,
    },
    {
        "slug": "voyager-1",
        "epoch_utc": REFERENCE_EPOCH,
        "position_x_km": -3720000000.0,
        "position_y_km": -20450000000.0,
        "position_z_km": 13920000000.0,
        "velocity_kms": 16.99,
    },
]


def seed_celestial_bodies(db: Session, *, commit: bool = True) -> int:
    existing_slugs = set(db.scalars(select(CelestialBody.slug)).all())
    new_rows = [
        CelestialBody(**item)
        for item in INITIAL_BODIES
        if item["slug"] not in existing_slugs
    ]
    if not new_rows:
        return 0

    db.add_all(new_rows)
    if commit:
        db.commit()
    else:
        db.flush()
    return len(new_rows)


def seed_telemetry_snapshots(db: Session, *, commit: bool = True) -> int:
    body_id_by_slug = dict(db.execute(select(CelestialBody.slug, CelestialBody.id)).all())
    existing_keys = set(
        db.execute(select(TelemetrySnapshot.body_id, TelemetrySnapshot.epoch_utc)).all()
    )

    new_rows: list[TelemetrySnapshot] = []
    for item in INITIAL_TELEMETRY:
        body_id = body_id_by_slug.get(item["slug"])
        if body_id is None:
            continue
        if (body_id, item["epoch_utc"]) in existing_keys:
            continue
        new_rows.append(
            TelemetrySnapshot(
                body_id=body_id,
                epoch_utc=item["epoch_utc"],
                position_x_km=item["position_x_km"],
                position_y_km=item["position_y_km"],
                position_z_km=item["position_z_km"],
                velocity_kms=item["velocity_kms"],
            )
        )

    if not new_rows:
        return 0

    db.add_all(new_rows)
    if commit:
        db.commit()
    else:
        db.flush()
    return len(new_rows)


def main() -> None:
    with SessionLocal() as db:
        inserted_bodies = seed_celestial_bodies(db, commit=True)
        inserted_telemetry = seed_telemetry_snapshots(db, commit=True)
        total_bodies = len(db.scalars(select(CelestialBody.slug)).all())
        total_telemetry = len(db.scalars(select(TelemetrySnapshot.id)).all())
    print(
        f"Seed complete: bodies(inserted={inserted_bodies}, total={total_bodies}) | "
        f"telemetry(inserted={inserted_telemetry}, total={total_telemetry})"
    )


if __name__ == "__main__":
    main()
