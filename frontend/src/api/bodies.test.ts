import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBodyTelemetry,
  fetchBodies,
  fetchBodyBySlug,
  fetchLatestTelemetry,
} from "./bodies";

describe("bodies API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed celestial bodies list", async () => {
    const payload = [
      {
        id: 1,
        slug: "earth",
        name: "Earth",
        body_type: "planet",
        parent_slug: "sun",
        radius_km: 6371,
        orbital_period_days: 365.256,
        ephemeris_source: "j2000-seed",
        created_at: "2026-11-26T00:00:00Z",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => payload,
      }),
    );

    const result = await fetchBodies();
    expect(result).toEqual(payload);
  });

  it("throws when single body lookup returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    await expect(fetchBodyBySlug("pluto")).rejects.toThrow(
      "Body 'pluto' failed (404)",
    );
  });

  it("returns latest telemetry snapshot when present", async () => {
    const snapshot = {
      id: 4,
      body_id: 4,
      epoch_utc: "2026-11-26T00:00:00",
      position_x_km: 63580000,
      position_y_km: 133450000,
      position_z_km: -12500,
      velocity_kms: 29.78,
      created_at: "2026-11-26T00:00:00Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => snapshot,
      }),
    );

    const result = await fetchLatestTelemetry("earth");
    expect(result).toEqual(snapshot);
  });

  it("returns null when latest telemetry returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const result = await fetchLatestTelemetry("earth");
    expect(result).toBeNull();
  });

  it("creates a telemetry snapshot and handles 409 conflicts", async () => {
    const created = {
      id: 12,
      body_id: 4,
      epoch_utc: "2026-11-27T00:00:00",
      position_x_km: 64000000,
      position_y_km: 133000000,
      position_z_km: -12000,
      velocity_kms: 29.8,
      created_at: "2026-11-27T00:00:00Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => created,
      }),
    );

    const result = await createBodyTelemetry("earth", {
      epoch_utc: "2026-11-27T00:00:00Z",
      position_x_km: 64000000,
      position_y_km: 133000000,
      position_z_km: -12000,
      velocity_kms: 29.8,
    });
    expect(result).toEqual(created);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
      }),
    );

    await expect(
      createBodyTelemetry("earth", {
        epoch_utc: "2026-11-27T00:00:00Z",
        position_x_km: 64000000,
        position_y_km: 133000000,
        position_z_km: -12000,
        velocity_kms: 29.8,
      }),
    ).rejects.toThrow("already exists");
  });
});
