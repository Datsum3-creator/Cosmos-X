import { describe, expect, it } from "vitest";
import type { CelestialBody } from "../api/bodies";
import { computeBodyPositions, getBodyVisualSpec } from "./orbitalLayout";

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
    const positions = computeBodyPositions(SAMPLE_BODIES, 0);
    expect(positions.sun).toEqual([0, 0, 0]);

    const earth = positions.earth;
    const moon = positions.moon;
    const dx = moon[0] - earth[0];
    const dy = moon[1] - earth[1];
    const dz = moon[2] - earth[2];
    const distance = Math.hypot(dx, dy, dz);

    const moonSpec = getBodyVisualSpec(SAMPLE_BODIES[2], 2);
    expect(distance).toBeCloseTo(moonSpec.orbitRadius, 1);
  });

  it("advances earth along its orbit as simulation days progress", () => {
    const day0 = computeBodyPositions(SAMPLE_BODIES, 0).earth;
    const quarterYear = computeBodyPositions(SAMPLE_BODIES, 91.314).earth;

    expect(day0[0]).not.toBeCloseTo(quarterYear[0], 1);
    expect(Math.hypot(day0[0], day0[2])).toBeCloseTo(
      Math.hypot(quarterYear[0], quarterYear[2]),
      3,
    );
  });
});
