# COSMOS X

3D orbital space visualization and telemetry platform built with **FastAPI**, **PostgreSQL 18**, **SQLAlchemy / Alembic**, and **React 19 + Three.js / React Three Fiber**.

## Architecture

* **Backend (ackend/)**: FastAPI v1 API (/api/v1/bodies, /telemetry, /telemetry/latest, /health, /health/db) using least-privilege PostgreSQL roles (cosmosx_migrator for schema migrations, cosmosx_app for runtime queries).
* **Frontend (rontend/)**: React Three Fiber 3D orbital workspace with J2000 Keplerian ephemeris, elliptical orbit paths, UTC time scrubber, URL hash state, 3D sprite labels, smooth fly-to camera, axial spin, and live telemetry Inspector + snapshot ingest UI.
* **Codegen (scripts/openapi-codegen/)**: Exports ackend/openapi.json from FastAPI and generates rontend/src/api/generated.d.ts via openapi-typescript.

## Local Setup (Windows 11 / PowerShell)

### 1. Backend & Database Seed

~~~powershell
Set-Location "D:\cosmos-x\backend"
uv run --no-sync alembic upgrade head
uv run --no-sync python -m cosmosx_backend.db.seed
uv run --no-sync python -m uvicorn cosmosx_backend.main:app --reload --port 8000
~~~

### 2. Frontend Dev Server

~~~powershell
Set-Location "D:\cosmos-x\frontend"
npm.cmd run dev
~~~

Open http://localhost:5173 (API docs at http://localhost:8000/docs).

## OpenAPI Type Codegen

~~~powershell
Set-Location "D:\cosmos-x\backend"
uv run --no-sync python -c "import json; from pathlib import Path; from cosmosx_backend.main import app; Path('openapi.json').write_text(json.dumps(app.openapi(), indent=2) + '\n', encoding='utf-8')"
Set-Location "D:\cosmos-x\scripts\openapi-codegen"
npm.cmd run generate
~~~

## Tests & Linting

### Backend

~~~powershell
Set-Location "D:\cosmos-x\backend"
uv run --no-sync python -m ruff check src tests
uv run --no-sync python -m pytest -v
~~~

### Frontend

~~~powershell
Set-Location "D:\cosmos-x\frontend"
npm.cmd run lint
npm.cmd test
npm.cmd run build
~~~
