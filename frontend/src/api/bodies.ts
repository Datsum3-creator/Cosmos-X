import type { components } from "./generated";

export type CelestialBody = components["schemas"]["CelestialBodyRead"];

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function fetchBodies(): Promise<CelestialBody[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/bodies`);
  if (!res.ok) {
    throw new Error(`Bodies list failed (${res.status})`);
  }
  return (await res.json()) as CelestialBody[];
}

export async function fetchBodyBySlug(slug: string): Promise<CelestialBody> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/bodies/${encodeURIComponent(slug)}`,
  );
  if (!res.ok) {
    throw new Error(`Body '${slug}' failed (${res.status})`);
  }
  return (await res.json()) as CelestialBody;
}
