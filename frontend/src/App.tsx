import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchBodies,
  fetchLatestTelemetry,
  type CelestialBody,
  type TelemetrySnapshot,
} from "./api/bodies";
import {
  fetchDbHealth,
  fetchHealth,
  type DbHealthResponse,
  type HealthResponse,
} from "./api/health";
import { CosmosScene } from "./scene/CosmosScene";

const RATE_OPTIONS = [1, 10, 45, 180] as const;
const AU_KM = 149_597_870.7;

interface TelemetryState {
  slug: string;
  snapshot: TelemetrySnapshot | null;
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

export function App() {
  const [bodies, setBodies] = useState<CelestialBody[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>("earth");
  const [telemetryState, setTelemetryState] = useState<TelemetryState | null>(
    null,
  );
  const [apiHealth, setApiHealth] = useState<HealthResponse | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [daysPerSecond, setDaysPerSecond] = useState<number>(10);
  const [simDays, setSimDays] = useState<number>(0);
  const [resetSignal, setResetSignal] = useState<number>(0);

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
          catalog.some((item) => item.slug === current)
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
    if (!selectedSlug) {
      return;
    }

    const controller = new AbortController();
    const targetSlug = selectedSlug;

    async function loadTelemetry() {
      try {
        const latest = await fetchLatestTelemetry(
          targetSlug,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setTelemetryState({
            slug: targetSlug,
            snapshot: latest,
            error: null,
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setTelemetryState({
            slug: targetSlug,
            snapshot: null,
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
  }, [selectedSlug]);

  const selectedBody = useMemo(
    () => bodies.find((item) => item.slug === selectedSlug) ?? null,
    [bodies, selectedSlug],
  );

  const activeTelemetry =
    selectedSlug && telemetryState?.slug === selectedSlug
      ? telemetryState
      : null;
  const telemetryLoading = selectedSlug !== null && activeTelemetry === null;
  const telemetry = activeTelemetry?.snapshot ?? null;
  const telemetryError = activeTelemetry?.error ?? null;

  const heliocentricAu = useMemo(() => {
    if (!telemetry) {
      return null;
    }
    const distKm = Math.hypot(
      telemetry.position_x_km,
      telemetry.position_y_km,
      telemetry.position_z_km,
    );
    return distKm / AU_KM;
  }, [telemetry]);

  const handleResetView = useCallback(() => {
    setSelectedSlug(null);
    setResetSignal((count) => count + 1);
  }, []);

  const isHealthy = apiHealth?.status === "ok" && dbHealth?.status === "ok";

  return (
    <div className="workspace">
      <div className="viewport">
        <CosmosScene
          bodies={bodies}
          selectedSlug={selectedSlug}
          onSelectBody={setSelectedSlug}
          isPlaying={isPlaying}
          daysPerSecond={daysPerSecond}
          resetSignal={resetSignal}
          onSimDaysTick={setSimDays}
        />
      </div>

      <header className="hud-panel hud-top">
        <div className="brand">
          <span className="brand-title">COSMOS X</span>
          <span className="brand-sub">Phase 1 · 3D Orbital Workspace</span>
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
                onClick={() => setSelectedSlug(body.slug)}
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
              <dt>Ephemeris</dt>
              <dd>{selectedBody.ephemeris_source}</dd>
            </dl>

            <div className="inspector-divider" />

            <div className="panel-header sub-header">
              <h2>Latest Telemetry</h2>
              <span className="badge">/telemetry/latest</span>
            </div>

            {telemetryLoading ? (
              <p className="empty-state">Loading state vector...</p>
            ) : telemetryError ? (
              <p className="empty-state error-text">{telemetryError}</p>
            ) : telemetry ? (
              <dl className="inspector-grid">
                <dt>Epoch</dt>
                <dd className="mono">{formatEpochUtc(telemetry.epoch_utc)}</dd>
                <dt>Range</dt>
                <dd className="mono">
                  {heliocentricAu !== null
                    ? `${heliocentricAu.toFixed(3)} AU`
                    : "N/A"}
                </dd>
                <dt>Velocity</dt>
                <dd className="mono">
                  {telemetry.velocity_kms !== null
                    ? `${telemetry.velocity_kms.toFixed(2)} km/s`
                    : "N/A"}
                </dd>
                <dt>Pos X</dt>
                <dd className="mono">{formatCoordKm(telemetry.position_x_km)}</dd>
                <dt>Pos Y</dt>
                <dd className="mono">{formatCoordKm(telemetry.position_y_km)}</dd>
                <dt>Pos Z</dt>
                <dd className="mono">{formatCoordKm(telemetry.position_z_km)}</dd>
              </dl>
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
            className="control-btn"
            onClick={handleResetView}
          >
            Reset View
          </button>
        </div>
        <div className="sim-readout">
          T+{simDays.toFixed(1)} days · Drag to orbit · Scroll to zoom
        </div>
      </footer>
    </div>
  );
}

export default App;
