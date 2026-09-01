@echo off
title AURA-AV Backend (Python 3.14.7)
echo ===================================================
echo Starting AURA-AV Backend on Python 3.14.7
echo ===================================================

if not exist "%~dp0.venv\Scripts\python.exe" (
    echo [!] Virtual environment .venv not found. Creating with Python 3.14.7...
    py -3.14 -m venv "%~dp0.venv"
    "%~dp0.venv\Scripts\python.exe" -m pip install -r "%~dp0backend\requirements.txt"
)

echo [*] Launching Uvicorn with Python 3.14.7...
"%~dp0.venv\Scripts\uvicorn.exe" app.main:app --app-dir "%~dp0backend" --host 0.0.0.0 --port 8000 --reload
pause

