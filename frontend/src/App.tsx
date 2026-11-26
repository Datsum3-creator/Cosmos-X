import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createBodyTelemetry,
  fetchBodies,
  fetchBodyTelemetry,
  type CelestialBody,
  type TelemetrySnapshot,
} from "./api/bodies";
import {
  fetchDbHealth,
  fetchHealth,
  type DbHealthResponse,
  type HealthResponse,
} from "./api/health";
import { CosmosScene, type SeekRequest } from "./scene/CosmosScene";
import { computeHeliocentricEclipticAu } from "./scene/ephemeris";
import { formatWorkspaceHash, parseWorkspaceHash } from "./utils/urlHashState";

const RATE_OPTIONS = [1, 10, 45, 180] as const;
const AU_KM = 149_597_870.7;
const SCRUB_MIN_MS = Date.UTC(2020, 0, 1, 0, 0, 0);
const SCRUB_MAX_MS = Date.UTC(2035, 11, 31, 23, 59, 0);

interface TelemetryBundle {
  slug: string;
  snapshots: TelemetrySnapshot[];
  error: string | null;
}

function formatCoordKm(km: number): string {
  if (Math.abs(km) >= 1_000_000) {
    return `${(km / 1_000_000).toFixed(2)}M km`;
  }
  return `${km.toLocaleString("en-US", { maximumFractionDigits: 0 })} km`;
}

function formatEpochUtc(epoch: string): string {
  return `${epoch.replace("T", " ").slice(0, 19)} UTC`;
}

function formatSimUtc(epochMs: number): string {
  return `${new Date(epochMs).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function clampScrubMs(epochMs: number): number {
  return Math.min(SCRUB_MAX_MS, Math.max(SCRUB_MIN_MS, epochMs));
}

function toDatetimeLocalUtc(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 16);
}

export function App() {
  const initialHash = useMemo(
    () => parseWorkspaceHash(window.location.hash),
    [],
  );

  const [bodies, setBodies] = useState<CelestialBody[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    () => initialHash.slug ?? "earth",
  );
  const [telemetryBundle, setTelemetryBundle] =
    useState<TelemetryBundle | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const [apiHealth, setApiHealth] = useState<HealthResponse | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(
    () => !(initialHash.paused ?? false),
  );
  const [daysPerSecond, setDaysPerSecond] = useState<number>(
    () => initialHash.rate ?? 10,
  );
  const [epochMs, setEpochMs] = useState<number>(
    () => initialHash.epochMs ?? Date.now(),
  );
  const [seekRequest, setSeekRequest] = useState<SeekRequest>({
    epochMs: 0,
    nonce: 0,
  });
  const [resetSignal, setResetSignal] = useState<number>(0);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  const [showIngestForm, setShowIngestForm] = useState<boolean>(false);
  const [ingestEpochInput, setIngestEpochInput] = useState<string>(() =>
    toDatetimeLocalUtc(Date.now()),
  );
  const [ingestXKm, setIngestXKm] = useState<string>("0");
  const [ingestYKm, setIngestYKm] = useState<string>("0");
  const [ingestZKm, setIngestZKm] = useState<string>("0");
  const [ingestVelKms, setIngestVelKms] = useState<string>("0");
  const [submittingTelemetry, setSubmittingTelemetry] =
    useState<boolean>(false);
  const [ingestFeedback, setIngestFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const lastHashSyncRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [health, db, catalog] = await Promise.all([
          fetchHealth(),
          fetchDbHealth(),
          fetchBodies(),
        ]);
        if (!active) {
          return;
        }
        setApiHealth(health);
        setDbHealth(db);
        setBodies(catalog);
        setSelectedSlug((current) =>
          current && catalog.some((item) => item.slug === current)
            ? current
            : (catalog[0]?.slug ?? null),
        );
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to connect to backend",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseWorkspaceHash(window.location.hash);
      if (parsed.slug !== null) {
        setSelectedSlug(parsed.slug);
      }
      if (parsed.rate !== null) {
        setDaysPerSecond(parsed.rate);
      }
      if (parsed.paused !== null) {
        setIsPlaying(!parsed.paused);
      }
      if (parsed.epochMs !== null) {
        const targetEpoch = parsed.epochMs;
        setEpochMs(targetEpoch);
        setSeekRequest((prev) => ({
          epochMs: targetEpoch,
          nonce: prev.nonce + 1,
        }));
      }
    };

    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    if (isPlaying && now - lastHashSyncRef.current < 1000) {
      return;
    }
    lastHashSyncRef.current = now;
    const nextHash = formatWorkspaceHash({
      slug: selectedSlug,
      rate: daysPerSecond,
      epochMs,
      paused: !isPlaying,
    });
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, [selectedSlug, daysPerSecond, epochMs, isPlaying]);

  useEffect(() => {
    if (!selectedSlug) {
      return;
    }

    const controller = new AbortController();
    const targetSlug = selectedSlug;

    async function loadTelemetry() {
      try {
        const snapshots = await fetchBodyTelemetry(
          targetSlug,
          8,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setTelemetryBundle({
            slug: targetSlug,
            snapshots,
            error: null,
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setTelemetryBundle({
            slug: targetSlug,
            snapshots: [],
            error:
              err instanceof Error ? err.message : "Telemetry unavailable",
          });
        }
      }
    }

    void loadTelemetry();
    return () => {
      controller.abort();
    };
  }, [selectedSlug, reloadNonce]);

  const selectedBody = useMemo(
    () => bodies.find((item) => item.slug === selectedSlug) ?? null,
    [bodies, selectedSlug],
  );

  const activeBundle =
    selectedSlug && telemetryBundle?.slug === selectedSlug
      ? telemetryBundle
      : null;
  const telemetryLoading = selectedSlug !== null && activeBundle === null;
  const snapshots = activeBundle?.snapshots ?? [];
  const latestTelemetry = snapshots[0] ?? null;
  const telemetryError = activeBundle?.error ?? null;

  const snapshotRangeAu = useMemo(() => {
    if (!latestTelemetry) {
      return null;
    }
    const distKm = Math.hypot(
      latestTelemetry.position_x_km,
      latestTelemetry.position_y_km,
      latestTelemetry.position_z_km,
    );
    return distKm / AU_KM;
  }, [latestTelemetry]);

  const liveJ2000RangeAu = useMemo(() => {
    if (!selectedSlug) {
      return null;
    }
    const vec = computeHeliocentricEclipticAu(selectedSlug, epochMs);
    if (!vec) {
      return null;
    }
    return Math.hypot(vec[0], vec[1], vec[2]);
  }, [selectedSlug, epochMs]);

  const handleSelectBody = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setIngestFeedback(null);
  }, []);

  const handleFillFromJ2000 = useCallback(() => {
    if (!selectedSlug) {
      return;
    }
    const vecAu = computeHeliocentricEclipticAu(selectedSlug, epochMs);
    if (vecAu) {
      setIngestXKm((vecAu[0] * AU_KM).toFixed(0));
      setIngestYKm((vecAu[1] * AU_KM).toFixed(0));
      setIngestZKm((vecAu[2] * AU_KM).toFixed(0));
    }
    setIngestEpochInput(toDatetimeLocalUtc(epochMs));
  }, [selectedSlug, epochMs]);

  const handleIngestSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedSlug) {
        return;
      }

      const parsedEpochMs = Date.parse(`${ingestEpochInput}:00Z`);
      const xKm = Number(ingestXKm);
      const yKm = Number(ingestYKm);
      const zKm = Number(ingestZKm);
      const velKms = ingestVelKms.trim() === "" ? null : Number(ingestVelKms);

      if (
        !Number.isFinite(parsedEpochMs) ||
        !Number.isFinite(xKm) ||
        !Number.isFinite(yKm) ||
        !Number.isFinite(zKm) ||
        (velKms !== null && !Number.isFinite(velKms))
      ) {
        setIngestFeedback({
          kind: "err",
          text: "Enter a valid UTC timestamp and numeric coordinates.",
        });
        return;
      }

      setSubmittingTelemetry(true);
      setIngestFeedback(null);
      try {
        await createBodyTelemetry(selectedSlug, {
          epoch_utc: new Date(parsedEpochMs).toISOString(),
          position_x_km: xKm,
          position_y_km: yKm,
          position_z_km: zKm,
          velocity_kms: velKms,
        });
        setIngestFeedback({
          kind: "ok",
          text: "Snapshot persisted to PostgreSQL.",
        });
        setReloadNonce((n) => n + 1);
      } catch (err) {
        setIngestFeedback({
          kind: "err",
          text:
            err instanceof Error ? err.message : "Failed to save snapshot.",
        });
      } finally {
        setSubmittingTelemetry(false);
      }
    },
    [
      selectedSlug,
      ingestEpochInput,
      ingestXKm,
      ingestYKm,
      ingestZKm,
      ingestVelKms,
    ],
  );

  const handleScrubChange = useCallback((nextEpochMs: number) => {
    setEpochMs(nextEpochMs);
    setSeekRequest((prev) => ({
      epochMs: nextEpochMs,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleJumpNow = useCallback(() => {
    const now = Date.now();
    setEpochMs(now);
    setSeekRequest((prev) => ({
      epochMs: now,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleResetView = useCallback(() => {
    setSelectedSlug(null);
    setIngestFeedback(null);
    setResetSignal((count) => count + 1);
  }, []);

  const isHealthy = apiHealth?.status === "ok" && dbHealth?.status === "ok";

  return (
    <div className="workspace">
      <div className="viewport">
        <CosmosScene
          bodies={bodies}
          selectedSlug={selectedSlug}
          onSelectBody={handleSelectBody}
          isPlaying={isPlaying}
          daysPerSecond={daysPerSecond}
          epochMs={epochMs}
          seekRequest={seekRequest}
          resetSignal={resetSignal}
          showLabels={showLabels}
          onEpochTick={setEpochMs}
        />
      </div>

      <header className="hud-panel hud-top">
        <div className="brand">
          <span className="brand-title">COSMOS X</span>
          <span className="brand-sub">Phase 1 · J2000 Orbital Workspace</span>
        </div>

        <div className="status-row">
          <span className={`status-pill ${isHealthy ? "ok" : "warn"}`}>
            <span className="dot" />
            {isHealthy
              ? `${apiHealth.service} · ${dbHealth.database} (${dbHealth.user})`
              : isLoading
                ? "Connecting to API..."
                : "Backend Disconnected"}
          </span>
          <span className="metric-pill">{bodies.length} Objects</span>
        </div>
      </header>

      {error && (
        <div className="hud-panel hud-error" role="alert">
          <strong>Backend Error:</strong> {error}
        </div>
      )}

      <aside className="hud-panel hud-left">
        <div className="panel-header">
          <h2>Celestial Catalog</h2>
          <span className="badge">/api/v1/bodies</span>
        </div>
        <div className="catalog-list">
          {bodies.map((body) => {
            const active = body.slug === selectedSlug;
            return (
              <button
                key={body.slug}
                type="button"
                className={`catalog-item ${active ? "active" : ""}`}
                onClick={() => handleSelectBody(body.slug)}
              >
                <span className="catalog-name">{body.name}</span>
                <span className="catalog-type">{body.body_type}</span>
              </button>
            );
          })}
          {!isLoading && bodies.length === 0 && (
            <p className="empty-state">No celestial bodies found in database.</p>
          )}
        </div>
      </aside>

      <aside className="hud-panel hud-right">
        <div className="panel-header">
          <h2>Inspector</h2>
          {selectedBody && (
            <span className="badge">{selectedBody.body_type}</span>
          )}
        </div>
        {selectedBody ? (
          <>
            <dl className="inspector-grid">
              <dt>Name</dt>
              <dd>{selectedBody.name}</dd>
              <dt>Slug</dt>
              <dd>{selectedBody.slug}</dd>
              <dt>Parent</dt>
              <dd>{selectedBody.parent_slug ?? "Barycenter"}</dd>
              <dt>Mean Radius</dt>
              <dd>
                {selectedBody.radius_km !== null
                  ? `${selectedBody.radius_km.toLocaleString("en-US")} km`
                  : "N/A"}
              </dd>
              <dt>Orbital Period</dt>
              <dd>
                {selectedBody.orbital_period_days !== null
                  ? `${selectedBody.orbital_period_days.toLocaleString("en-US")} days`
                  : "Unbound / Primary"}
              </dd>
              <dt>Live J2000</dt>
              <dd className="mono">
                {liveJ2000RangeAu !== null
                  ? `${liveJ2000RangeAu.toFixed(4)} AU`
                  : "Geocentric"}
              </dd>
              <dt>Ephemeris</dt>
              <dd>{selectedBody.ephemeris_source}</dd>
            </dl>

            <div className="inspector-divider" />

            <div className="panel-header sub-header">
              <h2>Latest Telemetry</h2>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  setShowIngestForm((open) => !open);
                  setIngestFeedback(null);
                }}
              >
                {showIngestForm ? "Close" : "+ Log Snapshot"}
              </button>
            </div>

            {showIngestForm && (
              <form className="ingest-form" onSubmit={handleIngestSubmit}>
                <div className="ingest-row-top">
                  <label className="ingest-label" htmlFor="ingest-epoch">
                    Epoch UTC
                  </label>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={handleFillFromJ2000}
                  >
                    Fill J2000
                  </button>
                </div>
                <input
                  id="ingest-epoch"
                  type="datetime-local"
                  className="ingest-input"
                  value={ingestEpochInput}
                  onChange={(e) => setIngestEpochInput(e.target.value)}
                  required
                />
                <div className="ingest-grid-2">
                  <div>
                    <label className="ingest-label" htmlFor="ingest-x">
                      X (km)
                    </label>
                    <input
                      id="ingest-x"
                      type="number"
                      step="any"
                      className="ingest-input"
                      value={ingestXKm}
                      onChange={(e) => setIngestXKm(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="ingest-label" htmlFor="ingest-y">
                      Y (km)
                    </label>
                    <input
                      id="ingest-y"
                      type="number"
                      step="any"
                      className="ingest-input"
                      value={ingestYKm}
                      onChange={(e) => setIngestYKm(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="ingest-label" htmlFor="ingest-z">
                      Z (km)
                    </label>
                    <input
                      id="ingest-z"
                      type="number"
                      step="any"
                      className="ingest-input"
                      value={ingestZKm}
                      onChange={(e) => setIngestZKm(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="ingest-label" htmlFor="ingest-vel">
                      Vel (km/s)
                    </label>
                    <input
                      id="ingest-vel"
                      type="number"
                      step="any"
                      className="ingest-input"
                      value={ingestVelKms}
                      onChange={(e) => setIngestVelKms(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="control-btn primary ingest-submit"
                  disabled={submittingTelemetry}
                >
                  {submittingTelemetry ? "Saving..." : "Persist Snapshot"}
                </button>
                {ingestFeedback && (
                  <p
                    className={`ingest-feedback ${ingestFeedback.kind === "ok" ? "ok" : "err"}`}
                  >
                    {ingestFeedback.text}
                  </p>
                )}
              </form>
            )}

            {telemetryLoading ? (
              <p className="empty-state">Loading state vector...</p>
            ) : telemetryError ? (
              <p className="empty-state error-text">{telemetryError}</p>
            ) : latestTelemetry ? (
              <>
                <dl className="inspector-grid">
                  <dt>Epoch</dt>
                  <dd className="mono">
                    {formatEpochUtc(latestTelemetry.epoch_utc)}
                  </dd>
                  <dt>Range</dt>
                  <dd className="mono">
                    {snapshotRangeAu !== null
                      ? `${snapshotRangeAu.toFixed(3)} AU`
                      : "N/A"}
                  </dd>
                  <dt>Velocity</dt>
                  <dd className="mono">
                    {latestTelemetry.velocity_kms !== null
                      ? `${latestTelemetry.velocity_kms.toFixed(2)} km/s`
                      : "N/A"}
                  </dd>
                  <dt>Pos X</dt>
                  <dd className="mono">
                    {formatCoordKm(latestTelemetry.position_x_km)}
                  </dd>
                  <dt>Pos Y</dt>
                  <dd className="mono">
                    {formatCoordKm(latestTelemetry.position_y_km)}
                  </dd>
                  <dt>Pos Z</dt>
                  <dd className="mono">
                    {formatCoordKm(latestTelemetry.position_z_km)}
                  </dd>
                </dl>

                {snapshots.length > 1 && (
                  <div className="history-block">
                    <div className="history-title">
                      Recent ({snapshots.length})
                    </div>
                    <div className="history-list">
                      {snapshots.slice(0, 4).map((snap) => (
                        <div key={snap.id} className="history-row">
                          <span className="mono">
                            {snap.epoch_utc.replace("T", " ").slice(0, 16)}
                          </span>
                          <span className="mono">
                            {snap.velocity_kms !== null
                              ? `${snap.velocity_kms.toFixed(2)} km/s`
                              : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="empty-state">
                No telemetry snapshots stored for this body.
              </p>
            )}
          </>
        ) : (
          <p className="empty-state">
            Click any body in the 3D viewport or catalog to lock camera focus.
          </p>
        )}
      </aside>

      <footer className="hud-panel hud-bottom">
        <div className="scrubber-row">
          <span className="utc-readout">{formatSimUtc(epochMs)}</span>
          <input
            type="range"
            className="time-slider"
            aria-label="Simulation UTC epoch"
            min={SCRUB_MIN_MS}
            max={SCRUB_MAX_MS}
            step={86_400_000}
            value={clampScrubMs(epochMs)}
            onChange={(event) => handleScrubChange(Number(event.target.value))}
          />
          <span className="scrub-bounds">2020 – 2035</span>
        </div>

        <div className="bottom-controls-row">
          <div className="controls-group">
            <button
              type="button"
              className="control-btn primary"
              onClick={() => setIsPlaying((prev) => !prev)}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            {RATE_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`control-btn ${daysPerSecond === rate ? "active" : ""}`}
                onClick={() => setDaysPerSecond(rate)}
              >
                {rate}d/s
              </button>
            ))}
            <button
              type="button"
              className={`control-btn ${showLabels ? "active" : ""}`}
              onClick={() => setShowLabels((prev) => !prev)}
            >
              Labels
            </button>
            <button
              type="button"
              className="control-btn"
              onClick={handleJumpNow}
            >
              Now
            </button>
            <button
              type="button"
              className="control-btn"
              onClick={handleResetView}
            >
              Reset View
            </button>
          </div>
          <div className="sim-readout">Drag to orbit · Scroll to zoom</div>
        </div>
      </footer>
    </div>
  );
}

export default App;
