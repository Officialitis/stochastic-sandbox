# start.ps1 — Launch Stochastic Sandbox (backend + frontend)
Write-Host "Starting Stochastic Sandbox..." -ForegroundColor Cyan

$rootDir = $PSScriptRoot

# Backend
$backendJob = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$rootDir'; backend\venv\Scripts\uvicorn backend.main:app --reload --port 8000"
) -PassThru

Write-Host "Backend started (PID $($backendJob.Id)) at http://localhost:8000" -ForegroundColor Green

Start-Sleep -Seconds 2

# Frontend
$frontendJob = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$rootDir\frontend'; npm run dev"
) -PassThru

Write-Host "Frontend started (PID $($frontendJob.Id)) at http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Sleep -Seconds 4
Start-Process "http://localhost:3000"
