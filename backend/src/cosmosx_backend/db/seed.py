from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session

from cosmosx_backend.db.session import SessionLocal
from cosmosx_backend.models.celestial import CelestialBody


class BodySeed(TypedDict):
    slug: str
    name: str
    body_type: str
    parent_slug: str | None
    radius_km: float | None
    orbital_period_days: float | None
    ephemeris_source: str


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


def main() -> None:
    with SessionLocal() as db:
        inserted = seed_celestial_bodies(db, commit=True)
        total = len(db.scalars(select(CelestialBody.slug)).all())
    print(f"Seed complete: inserted={inserted}, total={total}")


if __name__ == "__main__":
    main()
