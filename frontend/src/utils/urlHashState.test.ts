import { describe, expect, it } from "vitest";
import { formatWorkspaceHash, parseWorkspaceHash } from "./urlHashState";

describe("urlHashState", () => {
  it("round-trips slug, rate, timestamp, and paused flag", () => {
    const epochMs = Date.UTC(2026, 10, 26, 12, 30, 0);
    const encoded = formatWorkspaceHash({
      slug: "mars",
      rate: 45,
      epochMs,
      paused: true,
    });

    expect(encoded).toBe(
      "#/mars?rate=45&time=2026-11-26T12%3A30%3A00.000Z&paused=1",
    );

    const decoded = parseWorkspaceHash(encoded);
    expect(decoded).toEqual({
      slug: "mars",
      rate: 45,
      epochMs,
      paused: true,
    });
  });

  it("handles empty and malformed hashes gracefully", () => {
    expect(parseWorkspaceHash("")).toEqual({
      slug: null,
      rate: null,
      epochMs: null,
      paused: null,
    });

    expect(parseWorkspaceHash("#/earth?rate=-5&time=not-a-date")).toEqual({
      slug: "earth",
      rate: null,
      epochMs: null,
      paused: null,
    });
  });
});
