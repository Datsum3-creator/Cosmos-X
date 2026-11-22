import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDbHealth, fetchHealth } from "./health";

describe("health API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed API health payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          service: "COSMOS X API",
          environment: "development",
        }),
      }),
    );

    const result = await fetchHealth();
    expect(result).toEqual({
      status: "ok",
      service: "COSMOS X API",
      environment: "development",
    });
  });

  it("throws when DB health returns non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    await expect(fetchDbHealth()).rejects.toThrow("DB health failed (503)");
  });
});
