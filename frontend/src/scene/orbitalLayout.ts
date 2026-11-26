import type { CelestialBody, TelemetrySnapshot } from "../api/bodies";
import {
  MS_PER_DAY,
  computeHeliocentricEclipticAu,
  computeMoonOffsetScene,
  eclipticAuToScene,
  sampleKeplerOrbitCurve,
  sampleSpacecraftTrajectoryCurve,
  type SpacecraftTrajectoryCurve,
  type Vec3,
} from "./ephemeris";

export type { SpacecraftTrajectoryCurve, Vec3 };

const AU_KM = 149_597_870.7;

export interface BodyVisualSpec {
  slug: string;
  color: string;
  emissive: string;
  visualRadius: number;
  orbitRadius: number;
  initialAngleRad: number;
  inclinationRad: number;
  hasRing: boolean;
}

const KNOWN_SPECS: Record<string, Omit<BodyVisualSpec, "slug">> = {
  sun: {
    color: "#fbbf24",
    emissive: "#f59e0b",
    visualRadius: 2.5,
    orbitRadius: 0,
    initialAngleRad: 0,
    inclinationRad: 0,
    hasRing: false,
  },
  mercury: {
    color: "#a8a29e",
    emissive: "#1c1917",
    visualRadius: 0.32,
    orbitRadius: 6,
    initialAngleRad: 0.4,
    inclinationRad: 0.05,
    hasRing: false,
  },
  venus: {
    color: "#e7c98b",
    emissive: "#2b2110",
    visualRadius: 0.54,
    orbitRadius: 9,
    initialAngleRad: 1.7,
    inclinationRad: 0.03,
    hasRing: false,
  },
  earth: {
    color: "#3b82f6",
    emissive: "#0f2952",
    visualRadius: 0.62,
    orbitRadius: 12.8,
    initialAngleRad: 2.9,
    inclinationRad: 0,
    hasRing: false,
  },
  moon: {
    color: "#cbd5e1",
    emissive: "#1e293b",
    visualRadius: 0.2,
    orbitRadius: 1.55,
    initialAngleRad: 0.8,
    inclinationRad: 0.09,
    hasRing: false,
  },
  mars: {
    color: "#ef6c4d",
    emissive: "#3b140d",
    visualRadius: 0.46,
    orbitRadius: 16.5,
    initialAngleRad: 4.1,
    inclinationRad: 0.03,
    hasRing: false,
  },
  jupiter: {
    color: "#d9a066",
    emissive: "#2f1e0e",
    visualRadius: 1.45,
    orbitRadius: 22.5,
    initialAngleRad: 0.9,
    inclinationRad: 0.02,
    hasRing: false,
  },
  saturn: {
    color: "#e6c78c",
    emissive: "#2d2310",
    visualRadius: 1.2,
    orbitRadius: 29,
    initialAngleRad: 3.4,
    inclinationRad: 0.04,
    hasRing: true,
  },
  uranus: {
    color: "#67e8f9",
    emissive: "#0c3540",
    visualRadius: 0.85,
    orbitRadius: 35,
    initialAngleRad: 5.1,
    inclinationRad: 0.02,
    hasRing: false,
  },
  neptune: {
    color: "#60a5fa",
    emissive: "#102347",
    visualRadius: 0.82,
    orbitRadius: 40.5,
    initialAngleRad: 2.1,
    inclinationRad: 0.03,
    hasRing: false,
  },
  "voyager-1": {
    color: "#34d399",
    emissive: "#10b981",
    visualRadius: 0.34,
    orbitRadius: 47,
    initialAngleRad: 0.65,
    inclinationRad: 0.35,
    hasRing: false,
  },
  "voyager-2": {
    color: "#2dd4bf",
    emissive: "#0d9488",
    visualRadius: 0.34,
    orbitRadius: 45,
    initialAngleRad: 2.25,
    inclinationRad: -0.45,
    hasRing: false,
  },
  "new-horizons": {
    color: "#c084fc",
    emissive: "#7e22ce",
    visualRadius: 0.32,
    orbitRadius: 43,
    initialAngleRad: 4.95,
    inclinationRad: 0.04,
    hasRing: false,
  },
  "parker-solar-probe": {
    color: "#fb923c",
    emissive: "#ea580c",
    visualRadius: 0.3,
    orbitRadius: 5.5,
    initialAngleRad: 1.15,
    inclinationRad: 0.06,
    hasRing: false,
  },
};

export function getBodyVisualSpec(
  body: CelestialBody,
  index: number,
): BodyVisualSpec {
  const preset = KNOWN_SPECS[body.slug];
  if (preset) {
    return { slug: body.slug, ...preset };
  }

  const isSpacecraft = body.body_type === "spacecraft";
  const isMoon = body.body_type === "moon";
  return {
    slug: body.slug,
    color: isSpacecraft ? "#34d399" : isMoon ? "#cbd5e1" : "#93c5fd",
    emissive: isSpacecraft ? "#10b981" : "#0f172a",
    visualRadius: isSpacecraft ? 0.28 : isMoon ? 0.2 : 0.55,
    orbitRadius: isMoon ? 1.8 : 10 + index * 3.5,
    initialAngleRad: (index * 1.37) % (Math.PI * 2),
    inclinationRad: isSpacecraft ? 0.25 : 0.03,
    hasRing: false,
  };
}

export function getBodyOrbitCurve(
  body: CelestialBody,
  spec: BodyVisualSpec,
  epochMs: number,
): Vec3[] | null {
  if (
    body.slug === "sun" ||
    body.body_type === "spacecraft" ||
    (body.parent_slug && body.parent_slug !== "sun")
  ) {
    return null;
  }

  const keplerCurve = sampleKeplerOrbitCurve(body.slug, epochMs, 160);
  if (keplerCurve) {
    return keplerCurve;
  }

  if (spec.orbitRadius <= 0) {
    return null;
  }

  const segments = 128;
  const fallback: Vec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    fallback.push([
      Math.cos(angle) * spec.orbitRadius,
      Math.sin(angle) * Math.sin(spec.inclinationRad) * spec.orbitRadius,
      Math.sin(angle) * spec.orbitRadius,
    ]);
  }
  return fallback;
}

export function getSpacecraftTrajectoryCurve(
  body: CelestialBody,
  epochMs: number,
): SpacecraftTrajectoryCurve | null {
  if (body.body_type !== "spacecraft") {
    return null;
  }
  return sampleSpacecraftTrajectoryCurve(body.slug, epochMs, 160);
}

export function buildTelemetryTrailCurve(
  snapshots: TelemetrySnapshot[],
): Vec3[] {
  if (snapshots.length < 2) {
    return [];
  }

  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.epoch_utc) - Date.parse(b.epoch_utc),
  );

  return sorted.map((snap) =>
    eclipticAuToScene([
      snap.position_x_km / AU_KM,
      snap.position_y_km / AU_KM,
      snap.position_z_km / AU_KM,
    ]),
  );
}

export function computeBodyPositions(
  bodies: CelestialBody[],
  epochMs: number,
): Record<string, Vec3> {
  const specs = new Map<string, BodyVisualSpec>();
  bodies.forEach((body, idx) => {
    specs.set(body.slug, getBodyVisualSpec(body, idx));
  });

  const positions: Record<string, Vec3> = {};
  const fallbackDays = epochMs / MS_PER_DAY;

  const computeFallbackOffset = (body: CelestialBody): Vec3 => {
    const spec = specs.get(body.slug);
    if (!spec || spec.orbitRadius === 0) {
      return [0, 0, 0];
    }
    const period =
      body.orbital_period_days && body.orbital_period_days > 0
        ? body.orbital_period_days
        : 365.25;
    const angle = spec.initialAngleRad + (fallbackDays / period) * Math.PI * 2;
    return [
      Math.cos(angle) * spec.orbitRadius,
      Math.sin(angle) * Math.sin(spec.inclinationRad) * spec.orbitRadius,
      Math.sin(angle) * spec.orbitRadius,
    ];
  };

  for (const body of bodies) {
    if (!body.parent_slug || body.parent_slug === "sun") {
      const eclipticAu = computeHeliocentricEclipticAu(body.slug, epochMs);
      positions[body.slug] = eclipticAu
        ? eclipticAuToScene(eclipticAu)
        : computeFallbackOffset(body);
    }
  }

  for (const body of bodies) {
    if (body.parent_slug && body.parent_slug !== "sun") {
      const parentPos = positions[body.parent_slug] ?? [0, 0, 0];
      const spec = specs.get(body.slug);
      const offset =
        body.slug === "moon" && spec
          ? computeMoonOffsetScene(epochMs, spec.orbitRadius)
          : computeFallbackOffset(body);
      positions[body.slug] = [
        parentPos[0] + offset[0],
        parentPos[1] + offset[1],
        parentPos[2] + offset[2],
      ];
    }
  }

  return positions;
}
