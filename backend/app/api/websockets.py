from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
import json
import asyncio
import time
import math
import io
from PIL import Image, ImageDraw
from typing import List, Dict, Any

from app.engine.decision_engine import DecisionEngine
from app.perception.projection import ProjectionMap
from app.perception.tracker import Tracker

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_telemetry_connections: List[WebSocket] = []
        self.active_video_connections: List[WebSocket] = []
        self.active_faults: Dict[str, Dict[str, Any]] = {}
        self.decision_engine = DecisionEngine()
        self.projection_map = ProjectionMap()
        self.tracker = Tracker()
        self.frame_count = 0
        
        # Vehicle state
        self.ego_speed = 68.4
        self.target_speed = 70.0
        self.steering_angle = 0.0
        self.brake_pressure = 0
        self.throttle = 45

    async def connect_telemetry(self, websocket: WebSocket):
        await websocket.accept()
        self.active_telemetry_connections.append(websocket)

    def disconnect_telemetry(self, websocket: WebSocket):
        if websocket in self.active_telemetry_connections:
            self.active_telemetry_connections.remove(websocket)

    async def connect_video(self, websocket: WebSocket):
        await websocket.accept()
        self.active_video_connections.append(websocket)

    def disconnect_video(self, websocket: WebSocket):
        if websocket in self.active_video_connections:
            self.active_video_connections.remove(websocket)

manager = ConnectionManager()


def safe_rect(x0, y0, x1, y1):
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def generate_synthetic_frame(frame_idx: int, faults: Dict[str, Any], ego_speed: float) -> bytes:
    """
    Generates a 1280x720 synthetic camera frame using PIL/Pillow
    and returns JPEG encoded bytes for /ws/video.
    """
    width, height = 1280, 720
    horizon = int(height * 0.46)
    cx = width // 2

    # Create image
    img = Image.new('RGB', (width, height), color=(8, 12, 20))
    draw = ImageDraw.Draw(img)

    # 1. Sky & Horizon
    draw.rectangle([0, 0, width, horizon], fill=(12, 18, 30))

    # City silhouettes
    for bx in range(0, width, 40):
        bh = max(5, int(20 + math.sin(bx * 0.1) * 12 + math.cos(bx * 0.05) * 8))
        draw.rectangle(safe_rect(bx, horizon - bh, bx + 32, horizon), fill=(6, 10, 16))

    # 2. Road surface
    road_poly = [
        (cx - 70, horizon),
        (cx + 70, horizon),
        (width + 300, height),
        (-300, height)
    ]
    draw.polygon(road_poly, fill=(24, 30, 42))

    # Road Curbs
    draw.line([(cx - 70, horizon), (-300, height)], fill=(0, 240, 255), width=2)
    draw.line([(cx + 70, horizon), (width + 300, height)], fill=(0, 240, 255), width=2)

    # Moving Lane dashes
    offset = (frame_idx * 14) % 100
    for s in range(12):
        progress = ((s / 12.0) + (offset / 100.0)) % 1.0
        p1 = progress ** 2.2
        p2 = min(1.0, progress + 0.04) ** 2.2

        y1 = int(horizon + p1 * (height - horizon))
        y2 = int(horizon + p2 * (height - horizon))

        spread1 = (y1 - horizon) / max(1, height - horizon)
        spread2 = (y2 - horizon) / max(1, height - horizon)

        for lane_x in [-0.35, 0.35]:
            x1 = int(cx + (lane_x * 80) + lane_x * 480 * spread1)
            x2 = int(cx + (lane_x * 80) + lane_x * 480 * spread2)
            draw.line([(x1, y1), (x2, y2)], fill=(250, 204, 21), width=3)

    # 3. Dynamic Lead Vehicle
    has_cutin = 'cut_in_vehicle' in faults
    lead_z = 15.0 if has_cutin else 36.0
    scale = max(0.12, min(1.2, 28.0 / (lead_z + 5.0)))
    vy = int(horizon + (height - horizon) * ((1.0 - lead_z / 100.0) ** 1.8))
    vx = cx + (int(math.sin(frame_idx * 0.05) * 15) if not has_cutin else 25)

    vw = int(90 * scale)
    vh = int(60 * scale)
    car_color = (255, 42, 109) if has_cutin else (0, 240, 255)

    # Body
    draw.rectangle(safe_rect(vx - vw // 2, vy - vh, vx + vw // 2, vy), fill=car_color)
    # Windshield
    draw.rectangle(safe_rect(vx - int(vw * 0.35), vy - int(vh * 0.9), vx + int(vw * 0.35), vy - int(vh * 0.55)), fill=(6, 11, 20))
    # Taillights
    draw.rectangle(safe_rect(vx - vw // 2 + 2, vy - int(vh * 0.45), vx - int(vw * 0.25), vy - int(vh * 0.2)), fill=(255, 0, 50))
    draw.rectangle(safe_rect(vx + int(vw * 0.25), vy - int(vh * 0.45), vx + vw // 2 - 2, vy - int(vh * 0.2)), fill=(255, 0, 50))

    # 4. Injected Fault Effects
    if 'sensor_blindspot' in faults:
        draw.rectangle(safe_rect(int(width * 0.6), 0, width, height), fill=(180, 0, 40))
        draw.text((int(width * 0.62), 50), "[SENSOR BLINDSPOT OCCLUDED]", fill=(255, 255, 255))

    # 5. Dashcam Hood
    hood_poly = [
        (cx - 320, height),
        (cx - 160, height - 35),
        (cx + 160, height - 35),
        (cx + 320, height)
    ]
    draw.polygon(hood_poly, fill=(6, 11, 18))
    draw.line([(cx - 320, height), (cx - 160, height - 35), (cx + 160, height - 35), (cx + 320, height)], fill=(0, 240, 255), width=2)

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=80)
    return buf.getvalue()


@router.websocket("/ws/video")
async def websocket_video_endpoint(websocket: WebSocket):
    """
    Streams live synthetic video frames as binary byte stream.
    """
    await manager.connect_video(websocket)
    try:
        while True:
            manager.frame_count += 1
            frame_bytes = generate_synthetic_frame(
                manager.frame_count,
                manager.active_faults,
                manager.ego_speed
            )
            await websocket.send_bytes(frame_bytes)
            await asyncio.sleep(0.033) # ~30 FPS
    except Exception:
        pass
    finally:
        manager.disconnect_video(websocket)


@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    Bi-directional JSON stream carrying bounding boxes, trajectories, TTC metrics,
    and AV decisions, while accepting control/fault injection payloads.
    """
    await manager.connect_telemetry(websocket)
    
    async def receiver_loop():
        try:
            while True:
                msg_text = await websocket.receive_text()
                data = json.loads(msg_text)
                
                # Check for ping
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "clientTimestamp": data.get("clientTimestamp")
                    }))
                    continue
                
                # Process Fault Injections & Control Commands
                action = data.get("action")
                fault_type = data.get("faultType") or data.get("fault_type")
                
                if action in ["clear_faults", "reset_simulation"]:
                    manager.active_faults.clear()
                    manager.ego_speed = 68.4
                    manager.brake_pressure = 0
                elif action == "emergency_takeover":
                    manager.active_faults["manual_override"] = {"time": time.time(), "duration": 15}
                    manager.ego_speed = 0
                    manager.brake_pressure = 100
                elif fault_type:
                    duration = data.get("durationSec") or data.get("duration_sec") or 8
                    manager.active_faults[fault_type] = {
                        "time": time.time(),
                        "duration": duration,
                        "params": data.get("params", {})
                    }
                
                # Echo receipt confirmation
                await websocket.send_text(json.dumps({
                    "status": "acknowledged",
                    "action": action,
                    "active_faults": list(manager.active_faults.keys())
                }))
        except Exception:
            pass

    async def sender_loop():
        try:
            while True:
                now = time.time()
                # Clean expired faults
                for k in list(manager.active_faults.keys()):
                    fault_info = manager.active_faults[k]
                    if now - fault_info["time"] > fault_info["duration"]:
                        del manager.active_faults[k]

                has_cutin = "cut_in_vehicle" in manager.active_faults
                has_ped = "pedestrian_jaywalking" in manager.active_faults
                has_blindspot = "sensor_blindspot" in manager.active_faults
                has_emergency = "manual_override" in manager.active_faults

                # Mock Tracked objects
                objects_3d = []
                lead_z = 14.0 if has_cutin else 36.0
                objects_3d.append({"id": 101, "class": "car", "x": 0.0, "y": 0.0, "z": lead_z})

                if has_ped:
                    objects_3d.append({"id": 777, "class": "pedestrian", "x": -0.8, "y": 0.0, "z": 18.0})

                # Run Decision Engine
                action, reasoning = manager.decision_engine.evaluate_maneuvers(objects_3d)

                if has_emergency:
                    action = "Emergency Braking"
                    reasoning = {
                        "Maintain": "REJECTED: Operator takeover commanded.",
                        "Brake": "ACCEPTED: Full emergency brake applied.",
                        "Swerve": "REJECTED: Manual control priority."
                    }
                    manager.brake_pressure = 95
                elif action.startswith("Brake"):
                    manager.brake_pressure = 45
                else:
                    manager.brake_pressure = 0

                # Compute 2D bounding boxes and TTC
                tracked_objects = []
                min_ttc = float('inf')
                most_crit = None

                for obj in objects_3d:
                    rel_vel = 12.0 if obj["z"] < 20 else 5.0
                    ttc = manager.decision_engine.calculate_ttc(obj["z"], rel_vel)
                    if ttc < min_ttc and abs(obj["x"]) < 2.0:
                        min_ttc = ttc
                        most_crit = obj

                    # 2D Screen projection bbox
                    scale = max(0.1, min(1.2, 28.0 / (obj["z"] + 5.0)))
                    y_scr = int(330 + (720 - 330) * ((1.0 - obj["z"] / 100.0) ** 1.8))
                    x_scr = int(640 + obj["x"] * 120 * ((y_scr - 330) / 390.0))
                    bw = int(90 * scale)
                    bh = int(60 * scale)

                    risk = "CRITICAL" if ttc < 2.5 else "CAUTION" if ttc < 4.5 else "SAFE"

                    tracked_objects.append({
                        "id": obj["id"],
                        "class": obj["class"],
                        "bbox": [x_scr - bw // 2, y_scr - bh, x_scr + bw // 2, y_scr],
                        "confidence": 0.96,
                        "distance": round(obj["z"], 1),
                        "relativeVelocity": round(rel_vel, 1),
                        "ttc": round(ttc, 1) if ttc != float('inf') else 99.9,
                        "riskLevel": risk,
                        "trajectory": [
                            {"x": x_scr, "y": y_scr, "timeOffsetSec": 0},
                            {"x": x_scr, "y": y_scr - 25, "timeOffsetSec": 0.5},
                            {"x": x_scr, "y": y_scr - 50, "timeOffsetSec": 1.0},
                        ],
                        "position3D": obj
                    })

                packet = {
                    "timestamp": int(time.time() * 1000),
                    "frameId": manager.frame_count,
                    "objects": tracked_objects,
                    "decision": {
                        "id": f"dec-{manager.frame_count}",
                        "timestamp": time.strftime("%H:%M:%S") + f".{int(time.time() * 10) % 10}",
                        "action": action,
                        "confidence": 0.95 - (0.2 if has_blindspot else 0.0),
                        "targetSpeedKmh": 70 if action == "Maintain" else 35 if action == "Brake" else 0,
                        "reasoning": reasoning,
                        "primaryReason": reasoning.get(action, "Nominal autonomous cruising."),
                        "urgency": "critical" if min_ttc < 2.5 or has_emergency else "medium" if min_ttc < 4.5 else "low"
                    },
                    "metrics": {
                        "speedKmh": round(manager.ego_speed, 1),
                        "speedMph": round(manager.ego_speed * 0.621371, 1),
                        "targetSpeedKmh": manager.target_speed,
                        "steeringAngleDeg": round(math.sin(manager.frame_count * 0.03) * 1.5, 1),
                        "accelerationG": -0.45 if manager.brake_pressure > 0 else 0.05,
                        "lateralG": 0.02,
                        "brakePressurePct": manager.brake_pressure,
                        "throttlePct": 0 if manager.brake_pressure > 0 else manager.throttle,
                        "gear": "D",
                        "driveMode": "MANUAL_OVERRIDE" if has_emergency else "AUTONOMOUS",
                        "batterySoc": 91,
                        "distanceToLeadVehicle": lead_z,
                        "sensorStatus": {
                            "camera": "DEGRADED" if has_blindspot else "HEALTHY",
                            "lidar": "HEALTHY",
                            "radar": "HEALTHY",
                            "imu": "HEALTHY",
                            "gnss": "HEALTHY"
                        }
                    },
                    "ttcAlert": {
                        "level": "CRITICAL" if min_ttc < 2.5 else "CAUTION" if min_ttc < 4.5 else "SAFE",
                        "ttcSeconds": round(min_ttc, 1) if min_ttc != float('inf') else 99.9,
                        "targetId": most_crit["id"] if most_crit else None,
                        "targetClass": most_crit["class"] if most_crit else None,
                        "distanceMeters": most_crit["z"] if most_crit else None,
                        "message": f"CRITICAL: Headway with Target #{most_crit['id']} closing in {min_ttc:.1f}s!" if min_ttc < 2.5 and most_crit else "Path clearance verified."
                    },
                    "activeFaults": list(manager.active_faults.keys())
                }

                await websocket.send_text(json.dumps(packet))
                await asyncio.sleep(0.05) # 20 Hz
        except Exception:
            pass

    receiver_task = asyncio.create_task(receiver_loop())
    sender_task = asyncio.create_task(sender_loop())

    try:
        done, pending = await asyncio.wait(
            [receiver_task, sender_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    except Exception:
        pass
    finally:
        manager.disconnect_telemetry(websocket)
