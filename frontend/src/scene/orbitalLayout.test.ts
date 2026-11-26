import { describe, expect, it } from "vitest";
import type { CelestialBody, TelemetrySnapshot } from "../api/bodies";
import { MS_PER_DAY } from "./ephemeris";
import {
  buildTelemetryTrailCurve,
  computeBodyPositions,
  getBodyOrbitCurve,
  getBodyVisualSpec,
} from "./orbitalLayout";

const SAMPLE_BODIES: CelestialBody[] = [
  {
    id: 1,
    slug: "sun",
    name: "Sun",
    body_type: "star",
    parent_slug: null,
    radius_km: 696340,
    orbital_period_days: null,
    ephemeris_source: "j2000-seed",
    created_at: "2026-11-26T00:00:00Z",
  },
  {
    id: 2,
    slug: "earth",
    name: "Earth",
    body_type: "planet",
    parent_slug: "sun",
    radius_km: 6371,
    orbital_period_days: 365.256,
    ephemeris_source: "j2000-seed",
    created_at: "2026-11-26T00:00:00Z",
  },
  {
    id: 3,
    slug: "moon",
    name: "Moon",
    body_type: "moon",
    parent_slug: "earth",
    radius_km: 1737.4,
    orbital_period_days: 27.322,
    ephemeris_source: "j2000-seed",
    created_at: "2026-11-26T00:00:00Z",
  },
];

describe("orbitalLayout", () => {
  it("anchors the sun at origin and places moon relative to earth", () => {
    const epochMs = Date.UTC(2026, 10, 26, 0, 0, 0);
    const positions = computeBodyPositions(SAMPLE_BODIES, epochMs);
    expect(positions.sun).toEqual([0, 0, 0]);

    const earth = positions.earth;
    const moon = positions.moon;
    const distance = Math.hypot(
      moon[0] - earth[0],
      moon[1] - earth[1],
      moon[2] - earth[2],
    );

    const moonSpec = getBodyVisualSpec(SAMPLE_BODIES[2], 2);
    expect(distance).toBeCloseTo(moonSpec.orbitRadius, 1);
  });

  it("advances earth along its J2000 orbit and generates elliptical curve points", () => {
    const t0 = Date.UTC(2026, 10, 26, 0, 0, 0);
    const tQuarterYear = t0 + 91.314 * MS_PER_DAY;
    const day0 = computeBodyPositions(SAMPLE_BODIES, t0).earth;
    const quarterYear = computeBodyPositions(SAMPLE_BODIES, tQuarterYear).earth;

    expect(day0[0]).not.toBeCloseTo(quarterYear[0], 1);

    const earthSpec = getBodyVisualSpec(SAMPLE_BODIES[1], 1);
    const curve = getBodyOrbitCurve(SAMPLE_BODIES[1], earthSpec, t0);
    expect(curve).not.toBeNull();
    expect(curve).toHaveLength(160);
  });

  it("orders telemetry snapshots chronologically for 3D trail rendering", () => {
    const snapshots: TelemetrySnapshot[] = [
      {
        id: 2,
        body_id: 2,
        epoch_utc: "2026-11-27T00:00:00",
        position_x_km: 50_000_000,
        position_y_km: 140_000_000,
        position_z_km: 0,
        velocity_kms: 29.8,
        created_at: "2026-11-27T00:00:00Z",
      },
      {
        id: 1,
        body_id: 2,
        epoch_utc: "2026-11-26T00:00:00",
        position_x_km: 63_580_000,
        position_y_km: 133_450_000,
        position_z_km: -12_500,
        velocity_kms: 29.78,
        created_at: "2026-11-26T00:00:00Z",
      },
    ];

    const trail = buildTelemetryTrailCurve(snapshots);
    expect(trail).toHaveLength(2);
    expect(trail[0][0]).toBeGreaterThan(trail[1][0]);
  });
});
