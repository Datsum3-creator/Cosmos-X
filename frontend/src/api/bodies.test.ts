import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBodies, fetchBodyBySlug } from "./bodies";

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
});
