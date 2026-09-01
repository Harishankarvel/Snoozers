# PowerShell Launch Script for AURA-AV Backend (Python 3.14.7)
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " Starting AURA-AV Backend on Python 3.14.7" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan

$VenvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$VenvUvicorn = Join-Path $PSScriptRoot ".venv\Scripts\uvicorn.exe"
$BackendDir = Join-Path $PSScriptRoot "backend"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[!] Creating Python 3.14.7 virtual environment..." -ForegroundColor Yellow
    py -3.14 -m venv (Join-Path $PSScriptRoot ".venv")
    & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
}

Write-Host "[*] Launching FastAPI on http://localhost:8000 ..." -ForegroundColor Cyan
& $VenvUvicorn app.main:app --app-dir $BackendDir --host 0.0.0.0 --port 8000 --reload

