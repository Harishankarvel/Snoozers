# Python 3.11.9 Runtime Configuration

## Environment Details
- **Python Version**: `3.11.9`
- **Virtual Environment Path**: `.venv` (located at project root: `d:\Snoozers\.venv`)
- **Python Executable**: `.venv\Scripts\python.exe`
- **Backend Directory**: `d:\Snoozers\backend`

## Execution Guidelines for Agents
1. When running backend scripts or tests, always use the virtual environment executable:
   ```powershell
   .\.venv\Scripts\python.exe backend/<script_name>.py
   ```
2. When starting the FastAPI server:
   ```powershell
   .\.venv\Scripts\uvicorn.exe app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
   ```
