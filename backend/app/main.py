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

from fastapi.staticfiles import StaticFiles

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

# Mount compiled React frontend assets if available
frontend_dist = os.path.abspath(os.path.join(backend_dir, "..", "frontend", "dist"))
assets_dir = os.path.join(frontend_dist, "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

@app.get("/")
async def root():
    """
    Serves the production React dashboard client directly.
    """
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type="text/html")
        
    dashboard_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dashboard.html"))
    if os.path.exists(dashboard_path):
        return FileResponse(dashboard_path, media_type="text/html")
        
    return HTMLResponse("<h2>AURA-AV Decision Support Backend is Active.</h2><p>WebSockets: <code>/ws/video</code> &amp; <code>/ws/telemetry</code></p>")

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
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run('app.main:app', host='0.0.0.0', port=port, reload=False)