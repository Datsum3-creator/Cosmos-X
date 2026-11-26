import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBodies, type CelestialBody } from "./api/bodies";
import {
  fetchDbHealth,
  fetchHealth,
  type DbHealthResponse,
  type HealthResponse,
} from "./api/health";
import { CosmosScene } from "./scene/CosmosScene";

const RATE_OPTIONS = [1, 10, 45, 180] as const;

export function App() {
  const [bodies, setBodies] = useState<CelestialBody[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>("earth");
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

  const selectedBody = useMemo(
    () => bodies.find((item) => item.slug === selectedSlug) ?? null,
    [bodies, selectedSlug],
  );

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
                ? `${selectedBody.radius_km.toLocaleString()} km`
                : "N/A"}
            </dd>
            <dt>Orbital Period</dt>
            <dd>
              {selectedBody.orbital_period_days !== null
                ? `${selectedBody.orbital_period_days.toLocaleString()} days`
                : "Unbound / Primary"}
            </dd>
            <dt>Ephemeris</dt>
            <dd>{selectedBody.ephemeris_source}</dd>
          </dl>
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
