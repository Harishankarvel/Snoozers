
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.websockets import router as websocket_router

app = FastAPI(
    title="Explainable AV Decision Support",
    description="Backend for Autonomous Vehicle Decision-Support Dashboard",
    version="1.0.0"
)

# Configure CORS for frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the specific frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include WebSocket routes
app.include_router(websocket_router)

@app.get("/")
async def root():
    return {"message": "AV Decision Support Backend is running."}
