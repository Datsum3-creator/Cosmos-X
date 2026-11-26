export interface WorkspaceHashState {
  slug: string | null;
  rate: number | null;
  epochMs: number | null;
  paused: boolean | null;
}

export function parseWorkspaceHash(hash: string): WorkspaceHashState {
  const trimmed = hash.replace(/^#\/?/, "").trim();
  if (!trimmed) {
    return { slug: null, rate: null, epochMs: null, paused: null };
  }

  const [rawPath, rawQuery = ""] = trimmed.split("?");
  const slugSegment = decodeURIComponent(rawPath.split("/")[0] ?? "").trim();
  const slug = slugSegment.length > 0 ? slugSegment : null;

  const params = new URLSearchParams(rawQuery);

  let rate: number | null = null;
  const rawRate = params.get("rate");
  if (rawRate !== null && rawRate.trim() !== "") {
    const parsedRate = Number(rawRate);
    if (Number.isFinite(parsedRate) && parsedRate > 0 && parsedRate <= 3650) {
      rate = parsedRate;
    }
  }

  let epochMs: number | null = null;
  const rawTime = params.get("time");
  if (rawTime !== null && rawTime.trim() !== "") {
    const parsedTime = Date.parse(rawTime);
    if (Number.isFinite(parsedTime)) {
      epochMs = parsedTime;
    }
  }

  let paused: boolean | null = null;
  const rawPaused = params.get("paused");
  if (rawPaused === "1" || rawPaused === "true") {
    paused = true;
  } else if (rawPaused === "0" || rawPaused === "false") {
    paused = false;
  }

  return { slug, rate, epochMs, paused };
}

export function formatWorkspaceHash(state: {
  slug: string | null;
  rate: number;
  epochMs: number;
  paused: boolean;
}): string {
  const path = state.slug ? `#/${encodeURIComponent(state.slug)}` : "#/";
  const params = new URLSearchParams();
  params.set("rate", String(state.rate));
  params.set("time", new Date(state.epochMs).toISOString());
  if (state.paused) {
    params.set("paused", "1");
  }
  return `${path}?${params.toString()}`;
}
