param(
  [string]$ApiBaseUrl = "http://localhost:8000"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "1. Checking /health and /health/db..."
$health = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/health"
$dbHealth = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/health/db"
if ($health.status -ne "ok" -or $dbHealth.status -ne "ok") {
  throw "Health check failed: api=$($health.status), db=$($dbHealth.status)"
}
Write-Host "   API: $($health.service) ($($health.status)) | DB: $($dbHealth.database) ($($dbHealth.status))"

Write-Host "2. Checking /api/v1/bodies catalog..."
$bodies = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/api/v1/bodies"
Write-Host "   Total seeded bodies: $($bodies.Count)"
foreach ($slug in @("earth", "voyager-1", "voyager-2", "new-horizons", "parker-solar-probe")) {
  $found = $bodies | Where-Object { $_.slug -eq $slug }
  if (-not $found) {
    throw "Missing expected body slug in catalog: $slug"
  }
}

Write-Host "3. Checking /api/v1/bodies/voyager-2/telemetry/stream (SSE)..."
$streamRaw = curl.exe -sfN "$ApiBaseUrl/api/v1/bodies/voyager-2/telemetry/stream?poll_interval_s=0.1&max_events=1"
if (-not ($streamRaw -match "event: telemetry")) {
  throw "SSE stream did not emit expected telemetry event"
}
Write-Host "   SSE stream verified for voyager-2."
Write-Host "Live smoke check PASSED."
