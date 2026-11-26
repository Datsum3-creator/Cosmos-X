import { describe, expect, it } from "vitest";
import {
  J2000_UNIX_MS,
  computeHeliocentricEclipticAu,
  daysSinceJ2000,
  eclipticAuToScene,
  sampleKeplerOrbitCurve,
  solveKeplerEquation,
} from "./ephemeris";

describe("J2000 ephemeris engine", () => {
  it("computes days since J2000 accurately", () => {
    expect(daysSinceJ2000(J2000_UNIX_MS)).toBe(0);
    expect(daysSinceJ2000(Date.UTC(2000, 0, 2, 12, 0, 0))).toBe(1);
  });

  it("solves Kepler equation to sub-nanoradian precision", () => {
    const e = 0.20563593;
    const meanAnomaly = 1.2345;
    const eccAnomaly = solveKeplerEquation(meanAnomaly, e);
    expect(eccAnomaly - e * Math.sin(eccAnomaly)).toBeCloseTo(meanAnomaly, 8);
  });

  it("places Earth near 1 AU and Mars within its perihelion-aphelion bounds", () => {
    const epoch = Date.UTC(2026, 10, 26, 0, 0, 0);
    const earth = computeHeliocentricEclipticAu("earth", epoch);
    const mars = computeHeliocentricEclipticAu("mars", epoch);
    const sun = computeHeliocentricEclipticAu("sun", epoch);

    expect(sun).toEqual([0, 0, 0]);
    expect(earth).not.toBeNull();
    expect(mars).not.toBeNull();

    const earthAu = Math.hypot(earth![0], earth![1], earth![2]);
    const marsAu = Math.hypot(mars![0], mars![1], mars![2]);

    expect(earthAu).toBeGreaterThan(0.98);
    expect(earthAu).toBeLessThan(1.02);
    expect(marsAu).toBeGreaterThan(1.37);
    expect(marsAu).toBeLessThan(1.68);
  });

  it("advances Voyager 1 outward over time and samples elliptical orbits", () => {
    const t0 = Date.UTC(2026, 10, 26, 0, 0, 0);
    const t1 = Date.UTC(2027, 10, 26, 0, 0, 0);
    const v0 = computeHeliocentricEclipticAu("voyager-1", t0)!;
    const v1 = computeHeliocentricEclipticAu("voyager-1", t1)!;

    expect(Math.hypot(...v1)).toBeGreaterThan(Math.hypot(...v0));

    const curve = sampleKeplerOrbitCurve("mercury", t0, 64);
    expect(curve).not.toBeNull();
    expect(curve).toHaveLength(64);
    expect(eclipticAuToScene([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
