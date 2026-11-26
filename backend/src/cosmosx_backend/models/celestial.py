from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cosmosx_backend.db.base import Base, TimestampMixin


class CelestialBody(TimestampMixin, Base):
    __tablename__ = "celestial_bodies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    body_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    parent_slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    radius_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    orbital_period_days: Mapped[float | None] = mapped_column(Float, nullable=True)
    ephemeris_source: Mapped[str] = mapped_column(String(64), default="j2000-seed", nullable=False)

    snapshots: Mapped[list[TelemetrySnapshot]] = relationship(
        back_populates="body",
        cascade="all, delete-orphan",
    )


class TelemetrySnapshot(TimestampMixin, Base):
    __tablename__ = "telemetry_snapshots"
    __table_args__ = (
        UniqueConstraint("body_id", "epoch_utc", name="uq_snapshot_body_epoch"),
        Index("ix_snapshot_body_epoch", "body_id", "epoch_utc"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    body_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("celestial_bodies.id", ondelete="CASCADE"),
        nullable=False,
    )
    epoch_utc: Mapped[datetime] = mapped_column(nullable=False)
    position_x_km: Mapped[float] = mapped_column(Float, nullable=False)
    position_y_km: Mapped[float] = mapped_column(Float, nullable=False)
    position_z_km: Mapped[float] = mapped_column(Float, nullable=False)
    velocity_kms: Mapped[float | None] = mapped_column(Float, nullable=True)

    body: Mapped[CelestialBody] = relationship(back_populates="snapshots")
