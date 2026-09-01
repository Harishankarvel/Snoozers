import sys
import os

# Ensure the backend directory is in the Python path so 'app' can be found
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from app.api.websockets import router as websocket_router

app = FastAPI(
    title="AURA-AV Autonomous Vehicle Decision Support Backend",
    description="FastAPI Backend with Dual WebSockets for Video Streaming & Real-Time Telemetry",
    version="2.4.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include WebSocket routes (/ws/video, /ws/telemetry)
app.include_router(websocket_router)

@app.get("/")
async def root():
    """
    Serves the dashboard HTML client directly when accessed in a browser.
    """
    dashboard_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dashboard.html")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "index.html")),
    ]
    for path in dashboard_paths:
        if os.path.exists(path):
            return FileResponse(path, media_type="text/html")
            
    return HTMLResponse("<h2>AURA-AV Decision Support Backend is Active.</h2><p>WebSockets: <code>ws://localhost:8000/ws/video</code> &amp; <code>ws://localhost:8000/ws/telemetry</code></p>")

@app.get("/api/health")
async def health_check():
    return {
        "status": "HEALTHY",
        "service": "AURA-AV Decision Support System",
        "endpoints": {
            "video_ws": "/ws/video",
            "telemetry_ws": "/ws/telemetry"
        }
    }

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('app.main:app', host='127.0.0.1', port=8000, reload=True)