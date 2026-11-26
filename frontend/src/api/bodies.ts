import type { components } from "./generated";

export type CelestialBody = components["schemas"]["CelestialBodyRead"];
export type TelemetrySnapshot = components["schemas"]["TelemetrySnapshotRead"];
export type TelemetrySnapshotCreate =
  components["schemas"]["TelemetrySnapshotCreate"];
export type TelemetrySyncResponse =
  components["schemas"]["TelemetrySyncResponse"];

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

export async function fetchLatestTelemetry(
  slug: string,
  signal?: AbortSignal,
): Promise<TelemetrySnapshot | null> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/bodies/${encodeURIComponent(slug)}/telemetry/latest`,
    { signal },
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Latest telemetry for '${slug}' failed (${res.status})`);
  }
  return (await res.json()) as TelemetrySnapshot;
}

export async function fetchBodyTelemetry(
  slug: string,
  limit = 25,
  signal?: AbortSignal,
): Promise<TelemetrySnapshot[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/bodies/${encodeURIComponent(slug)}/telemetry?limit=${limit}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`Telemetry history for '${slug}' failed (${res.status})`);
  }
  return (await res.json()) as TelemetrySnapshot[];
}

export async function createBodyTelemetry(
  slug: string,
  payload: TelemetrySnapshotCreate,
): Promise<TelemetrySnapshot> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/bodies/${encodeURIComponent(slug)}/telemetry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (res.status === 409) {
    throw new Error("A telemetry snapshot for this body and epoch already exists.");
  }
  if (!res.ok) {
    throw new Error(`Create telemetry for '${slug}' failed (${res.status})`);
  }
  return (await res.json()) as TelemetrySnapshot;
}

export async function syncBodyTelemetry(
  slug: string,
  epochUtc?: string,
): Promise<TelemetrySyncResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/bodies/${encodeURIComponent(slug)}/telemetry/sync`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(epochUtc ? { epoch_utc: epochUtc } : {}),
    },
  );
  if (res.status === 404) {
    throw new Error(`No JPL Horizons state vector available for '${slug}'.`);
  }
  if (!res.ok) {
    throw new Error(`Horizons sync for '${slug}' failed (${res.status})`);
  }
  return (await res.json()) as TelemetrySyncResponse;
}
