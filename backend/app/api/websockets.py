from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import asyncio
from typing import List

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    Streams live telemetry data (bounding boxes, trajectories, TTC, decisions)
    to the frontend dashboard.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Receive data from frontend (e.g., edge case injections)
            data = await websocket.receive_text()
            print(f"Received from client: {data}")
            
            # Note: In a real system, the broadcasting would be triggered by 
            # a background loop processing the video/sensor feed. 
            # Here we just echo for skeleton testing.
            response = {"status": "received", "data": data}
            await manager.broadcast(json.dumps(response))
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("Client disconnected from /ws/telemetry")

@router.websocket("/ws/video")
async def websocket_video_endpoint(websocket: WebSocket):
    """
    Streams the raw or annotated video frames.
    """
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            # Handle incoming frames or configuration
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("Client disconnected from /ws/video")
