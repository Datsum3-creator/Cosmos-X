export type Vec3 = [number, number, number];

export interface KeplerElements {
  a: number;
  aDot: number;
  e: number;
  eDot: number;
  iDeg: number;
  iDot: number;
  lDeg: number;
  lDot: number;
  wBarDeg: number;
  wBarDot: number;
  nodeDeg: number;
  nodeDot: number;
}

export const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const MS_PER_DAY = 86_400_000;
const DEG_TO_RAD = Math.PI / 180;

// Standish (1992) J2000.0 approximate planetary elements (valid 1800–2050 AD)
export const PLANET_ELEMENTS: Record<string, KeplerElements> = {
  mercury: {
    a: 0.38709927,
    aDot: 0.00000037,
    e: 0.20563593,
    eDot: 0.00001906,
    iDeg: 7.00497902,
    iDot: -0.00594749,
    lDeg: 252.2503235,
    lDot: 149472.67411175,
    wBarDeg: 77.45779628,
    wBarDot: 0.16047689,
    nodeDeg: 48.33076593,
    nodeDot: -0.12534081,
  },
  venus: {
    a: 0.72333566,
    aDot: 0.0000039,
    e: 0.00677672,
    eDot: -0.00004107,
    iDeg: 3.39467605,
    iDot: -0.0007889,
    lDeg: 181.9790995,
    lDot: 58517.81538729,
    wBarDeg: 131.60246718,
    wBarDot: 0.00268329,
    nodeDeg: 76.67984255,
    nodeDot: -0.27769418,
  },
  earth: {
    a: 1.00000261,
    aDot: 0.00000562,
    e: 0.01671123,
    eDot: -0.00004392,
    iDeg: -0.00001531,
    iDot: -0.01294668,
    lDeg: 100.46457166,
    lDot: 35999.37244981,
    wBarDeg: 102.93768193,
    wBarDot: 0.32327364,
    nodeDeg: 0.0,
    nodeDot: 0.0,
  },
  mars: {
    a: 1.52371034,
    aDot: 0.00001847,
    e: 0.0933941,
    eDot: 0.00007882,
    iDeg: 1.84969142,
    iDot: -0.00813131,
    lDeg: -4.55343205,
    lDot: 19140.30268499,
    wBarDeg: -23.94362959,
    wBarDot: 0.44441088,
    nodeDeg: 49.55953891,
    nodeDot: -0.29257343,
  },
  jupiter: {
    a: 5.202887,
    aDot: -0.00011607,
    e: 0.04838624,
    eDot: -0.00013253,
    iDeg: 1.30439695,
    iDot: -0.00183714,
    lDeg: 34.39644051,
    lDot: 3034.74612775,
    wBarDeg: 14.72847983,
    wBarDot: 0.21252668,
    nodeDeg: 100.47390909,
    nodeDot: 0.20469106,
  },
  saturn: {
    a: 9.53667594,
    aDot: -0.0012506,
    e: 0.05386179,
    eDot: -0.00050991,
    iDeg: 2.48599187,
    iDot: 0.00193609,
    lDeg: 49.95424423,
    lDot: 1222.49362201,
    wBarDeg: 92.59887831,
    wBarDot: -0.41897216,
    nodeDeg: 113.66242448,
    nodeDot: -0.28867794,
  },
  uranus: {
    a: 19.18916464,
    aDot: -0.00196176,
    e: 0.04725744,
    eDot: -0.00004397,
    iDeg: 0.77263783,
    iDot: -0.00242939,
    lDeg: 313.23810451,
    lDot: 428.48202785,
    wBarDeg: 170.9542763,
    wBarDot: 0.40805281,
    nodeDeg: 74.01692503,
    nodeDot: 0.04240589,
  },
  neptune: {
    a: 30.06992276,
    aDot: 0.00026291,
    e: 0.00859048,
    eDot: 0.00005105,
    iDeg: 1.77004347,
    iDot: 0.00035372,
    lDeg: -55.12002969,
    lDot: 218.45945325,
    wBarDeg: 44.96476227,
    wBarDot: -0.32241464,
    nodeDeg: 131.78422574,
    nodeDot: -0.00508664,
  },
};

export function daysSinceJ2000(epochMs: number): number {
  return (epochMs - J2000_UNIX_MS) / MS_PER_DAY;
}

export function normalizeRadians(rad: number): number {
  let wrapped = (rad + Math.PI) % (Math.PI * 2);
  if (wrapped < 0) {
    wrapped += Math.PI * 2;
  }
  return wrapped - Math.PI;
}

export function solveKeplerEquation(
  meanAnomalyRad: number,
  eccentricity: number,
): number {
  const m = normalizeRadians(meanAnomalyRad);
  let eccentric = m + eccentricity * Math.sin(m);
  for (let iter = 0; iter < 10; iter += 1) {
    const f = eccentric - eccentricity * Math.sin(eccentric) - m;
    const fPrime = 1 - eccentricity * Math.cos(eccentric);
    const delta = f / fPrime;
    eccentric -= delta;
    if (Math.abs(delta) < 1e-9) {
      break;
    }
  }
  return eccentric;
}

function eclipticFromElements(
  el: KeplerElements,
  centuries: number,
  overrideMeanAnomalyRad?: number,
): Vec3 {
  const a = el.a + el.aDot * centuries;
  const e = el.e + el.eDot * centuries;
  const inc = (el.iDeg + el.iDot * centuries) * DEG_TO_RAD;
  const l = (el.lDeg + el.lDot * centuries) * DEG_TO_RAD;
  const wBar = (el.wBarDeg + el.wBarDot * centuries) * DEG_TO_RAD;
  const node = (el.nodeDeg + el.nodeDot * centuries) * DEG_TO_RAD;

  const argPeri = wBar - node;
  const meanAnomaly = overrideMeanAnomalyRad ?? l - wBar;
  const eccAnomaly = solveKeplerEquation(meanAnomaly, e);

  const xOrb = a * (Math.cos(eccAnomaly) - e);
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(eccAnomaly);

  const cosW = Math.cos(argPeri);
  const sinW = Math.sin(argPeri);
  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  const xEcl =
    (cosW * cosO - sinW * sinO * cosI) * xOrb +
    (-sinW * cosO - cosW * sinO * cosI) * yOrb;
  const yEcl =
    (cosW * sinO + sinW * cosO * cosI) * xOrb +
    (-sinW * sinO + cosW * cosO * cosI) * yOrb;
  const zEcl = sinW * sinI * xOrb + cosW * sinI * yOrb;

  return [xEcl, yEcl, zEcl];
}

export function computeHeliocentricEclipticAu(
  slug: string,
  epochMs: number,
): Vec3 | null {
  if (slug === "sun") {
    return [0, 0, 0];
  }

  const d = daysSinceJ2000(epochMs);
  const elements = PLANET_ELEMENTS[slug];
  if (elements) {
    return eclipticFromElements(elements, d / 36525);
  }

  if (slug === "voyager-1") {
    // Anchor near Voyager 1's 2026 heliocentric state (~168 AU, outbound ~3.57 AU/yr)
    const yearsFrom2026 = (epochMs - Date.UTC(2026, 10, 26, 0, 0, 0)) / (365.25 * MS_PER_DAY);
    const rangeAu = Math.max(12, 168.0 + yearsFrom2026 * 3.57);
    const dirX = -0.148;
    const dirY = -0.817;
    const dirZ = 0.557;
    const norm = Math.hypot(dirX, dirY, dirZ);
    return [
      (dirX / norm) * rangeAu,
      (dirY / norm) * rangeAu,
      (dirZ / norm) * rangeAu,
    ];
  }

  return null;
}

export function eclipticAuToScene(vecAu: Vec3): Vec3 {
  const [xEcl, yEcl, zEcl] = vecAu;
  const rAu = Math.hypot(xEcl, yEcl, zEcl);
  if (rAu === 0) {
    return [0, 0, 0];
  }

  // Smooth logarithmic radial compression: keeps inner planets clear of the Sun
  // while keeping Neptune and Voyager 1 framed cleanly in the 3D scene.
  const sceneR = 3.0 + Math.log(1 + rAu * 2.2) * 10.8;
  const scale = sceneR / rAu;

  // Map right-handed ecliptic (XY plane, +Z north) -> Three.js (XZ plane, +Y up)
  return [xEcl * scale, zEcl * scale, -yEcl * scale];
}

export function computeMoonOffsetScene(
  epochMs: number,
  orbitRadiusScene: number,
): Vec3 {
  const d = daysSinceJ2000(epochMs);
  const periodDays = 27.321661;
  const meanAnomaly = ((d / periodDays) * Math.PI * 2 + 2.35) % (Math.PI * 2);
  const inc = 5.145 * DEG_TO_RAD;
  const eccAnomaly = solveKeplerEquation(meanAnomaly, 0.0549);

  const x = Math.cos(eccAnomaly) * orbitRadiusScene;
  const z = -Math.sin(eccAnomaly) * orbitRadiusScene;
  const y = Math.sin(eccAnomaly) * Math.sin(inc) * orbitRadiusScene;
  return [x, y, z];
}

export function sampleKeplerOrbitCurve(
  slug: string,
  epochMs: number,
  segments = 160,
): Vec3[] | null {
  const elements = PLANET_ELEMENTS[slug];
  if (!elements) {
    return null;
  }

  const centuries = daysSinceJ2000(epochMs) / 36525;
  const points: Vec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const meanAnomaly = (i / segments) * Math.PI * 2;
    const eclipticAu = eclipticFromElements(elements, centuries, meanAnomaly);
    points.push(eclipticAuToScene(eclipticAu));
  }
  return points;
}
