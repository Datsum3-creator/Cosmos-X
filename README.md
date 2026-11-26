# COSMOS X

3D celestial mechanics and telemetry visualization platform built with **FastAPI**, **PostgreSQL 18**, and **React / Three.js / Vite**.

## Architecture & Capabilities

- **Celestial Catalog & State Vectors (/api/v1/bodies):** 14 seeded bodies (sun, mercury, venus, earth, moon, mars, jupiter, saturn, uranus, neptune, voyager-1, voyager-2, new-horizons, parker-solar-probe) backed by SQLAlchemy models, Alembic migrations, and idempotent seeding.
- **NASA JPL Horizons Sync (POST /api/v1/bodies/{slug}/telemetry/sync):** Fetches heliocentric/geocentric ecliptic state vectors (KM-S) from [https://ssd.jpl.nasa.gov/api/horizons.api](https://ssd.jpl.nasa.gov/api/horizons.api) and persists idempotent TelemetrySnapshot rows.
- **Real-Time Telemetry Stream (GET /api/v1/bodies/{slug}/telemetry/stream):** Streams Server-Sent Events (text/event-stream) with telemetry payloads and heartbeat comments, wired to EventSource in the Inspector.
- **3D Viewport & Trajectories (CosmosScene.tsx):** J2000-anchored planetary orbits, Milky Way galactic view toggle, historical telemetry trails, and mission trajectory curves (outbound interstellar paths for Voyager 1, Voyager 2, and New Horizons; eccentric solar orbit for Parker Solar Probe).
- **Bundle Splitting & Smoke Verification:** Vite manual chunk splitting (index, vendor, three-vendor) and scripts/smoke-live.ps1.

## Local Development

### Backend (D:\cosmos-x\backend)

1. Run migrations and seed: uv run --no-sync alembic upgrade head && uv run --no-sync python -m cosmosx_backend.db.seed
2. Start API server: uv run --no-sync uvicorn cosmosx_backend.main:app --reload
3. Lint and test: uv run --no-sync python -m ruff check src tests && uv run --no-sync python -m pytest -v

### Frontend (D:\cosmos-x\frontend)

1. Install and run dev server: npm.cmd install && npm.cmd run dev
2. Lint, test, and build: npm.cmd run lint && npm.cmd test && npm.cmd run build

### Live API Smoke Check

With the backend running on http://localhost:8000, run:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-live.ps1

## Docker Compose & CI/CD

- **Docker Stack (docker-compose.yml):** Orchestrates postgres:18-alpine, backend/Dockerfile (uv, Alembic, seed, Uvicorn), and frontend/Dockerfile (multi-stage Node/Vite build served by nginx:1.27-alpine).
- **GitHub Actions (.github/workflows/ci.yml):** Runs ruff and pytest against PostgreSQL 18 on backend, and oxlint, vitest, and vite build on frontend on pushes and pull requests to main.