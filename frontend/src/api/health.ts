export interface HealthResponse {
  status: string;
  service: string;
  environment: string;
}

export interface DbHealthResponse {
  status: string;
  database: string;
  user: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) {
    throw new Error(`API health failed (${res.status})`);
  }
  return (await res.json()) as HealthResponse;
}

export async function fetchDbHealth(): Promise<DbHealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health/db`);
  if (!res.ok) {
    throw new Error(`DB health failed (${res.status})`);
  }
  return (await res.json()) as DbHealthResponse;
}
