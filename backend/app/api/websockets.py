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
        
        # Vehicle dynamics & state
        self.ego_speed = 68.4
        self.target_speed = 70.0
        self.steering_angle = 0.0
        self.brake_pressure = 0
        self.throttle = 45
        self.lateral_offset = 0.0  # meters from lane center
        self.road_offset = 0.0
        
        # Journey & Analytics metrics
        self.total_distance_travelled = 0.0  # meters
        self.journey_start_time = time.time()
        self.journey_end_time = None
        self.trip_max_speed = 68.4
        self.speed_sum = 0.0
        self.speed_samples_count = 0
        self.hazard_events_tackled = 0
        self.in_hazard_state = False
        self.last_action = "Maintain Course"
        self.last_inference_latency = 0.0
        
        # Pedestrian Tracking
        self.detected_pedestrian_ids = set()
        self.total_pedestrians_detected = 0
        self.active_pedestrians_count = 0
        
        # Path Deviation tracking
        self.current_path_deviation = 0.0  # meters
        self.max_path_deviation = 0.0      # meters
        self.avg_path_deviation = 0.0      # meters
        self.deviation_samples_count = 0
        self.journey_status = "IN_PROGRESS"  # "IN_PROGRESS" | "COMPLETED"

    def reset_journey(self):
        self.total_distance_travelled = 0.0
        self.journey_start_time = time.time()
        self.journey_end_time = None
        self.trip_max_speed = 68.4
        self.speed_sum = 0.0
        self.speed_samples_count = 0
        self.hazard_events_tackled = 0
        self.in_hazard_state = False
        self.detected_pedestrian_ids.clear()
        self.total_pedestrians_detected = 0
        self.active_pedestrians_count = 0
        self.current_path_deviation = 0.0
        self.max_path_deviation = 0.0
        self.avg_path_deviation = 0.0
        self.deviation_samples_count = 0
        self.lateral_offset = 0.0
        self.road_offset = 0.0
        self.ego_speed = 68.4
        self.brake_pressure = 0
        self.active_faults.clear()
        self.journey_status = "IN_PROGRESS"

    def complete_journey(self):
        self.journey_status = "COMPLETED"
        if not self.journey_end_time:
            self.journey_end_time = time.time()
        self.ego_speed = 0.0
        self.brake_pressure = 100


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

def orchestrate_sensors(has_ped: bool, has_cutin: bool, has_sudden_brake: bool, has_weather: bool, has_blindspot: bool, has_pothole: bool, speed: float):
    """
    Autonomous Model-Driven Sensor Gating & Allocation Engine:
    Perception model autonomously activates, boosts, or idles sensors based on environmental context and driving hazards.
    """
    sensors = {
        "camera": "ACTIVE",
        "lidar": "STANDBY",
        "radar": "ACTIVE",
        "imu": "ACTIVE",
        "gnss": "ACTIVE"
    }
    rationale = "Nominal multi-modal sensor fusion."

    if has_weather:
        sensors["camera"] = "DEGRADED"
        sensors["lidar"] = "DEGRADED"
        sensors["radar"] = "BOOSTED"
        sensors["imu"] = "BOOSTED"
        sensors["gnss"] = "ACTIVE"
        rationale = "Weather Mode: mmWave RADAR boosted for rain/fog penetration; IMU tracking hydroplane slip."
    elif has_ped:
        sensors["camera"] = "BOOSTED"
        sensors["lidar"] = "BOOSTED"
        sensors["radar"] = "ACTIVE"
        sensors["imu"] = "BOOSTED"
        sensors["gnss"] = "STANDBY"
        rationale = "Pedestrian Lock: High-density 3D LIDAR & Camera vision fused for limb & forward corridor tracking."
    elif has_pothole:
        sensors["lidar"] = "BOOSTED"
        sensors["camera"] = "BOOSTED"
        sensors["radar"] = "ACTIVE"
        sensors["imu"] = "BOOSTED"
        sensors["gnss"] = "ACTIVE"
        rationale = "Surface Hazard: High-frequency LIDAR ground profiling & Camera contrast scan for pothole avoidance."
    elif has_cutin or has_sudden_brake:
        sensors["radar"] = "BOOSTED"
        sensors["lidar"] = "ACTIVE"
        sensors["camera"] = "ACTIVE"
        sensors["imu"] = "BOOSTED"
        sensors["gnss"] = "STANDBY"
        rationale = "Rapid Closing Rate: Doppler RADAR boosted for instant micro-second velocity measurement."
    elif has_blindspot:
        sensors["camera"] = "DEGRADED"
        sensors["radar"] = "BOOSTED"
        sensors["lidar"] = "BOOSTED"
        sensors["imu"] = "ACTIVE"
        sensors["gnss"] = "ACTIVE"
        rationale = "Blindspot Recovery: Side-sector RADAR & LIDAR fused to substitute occluded camera sector."
    elif speed > 55:
        sensors["camera"] = "ACTIVE"
        sensors["radar"] = "ACTIVE"
        sensors["lidar"] = "STANDBY"
        sensors["imu"] = "ACTIVE"
        sensors["gnss"] = "ACTIVE"
        rationale = "High-Speed Cruising: Long-range Camera & Forward RADAR allocated for lane tracking."

    return sensors, rationale


def compute_screen_projection(x_meters: float, z_meters: float, horizon: int = 331, screen_w: int = 1280, screen_h: int = 720):
    """
    Unified 3D-to-2D Perspective Camera Projection:
    Aligns lateral real-world lane offsets exactly onto the 3-lane perspective roadway:
      - x = -3.5m -> Left Lane Center
      - x =  0.0m -> Center (Ego) Lane Center
      - x = +3.5m -> Right Lane Center
    """
    cx = screen_w // 2
    z_clamped = max(1.0, min(100.0, z_meters))
    y_norm = max(0.0, min(1.0, (1.0 - z_clamped / 100.0) ** 1.8))
    vy = int(horizon + (screen_h - horizon) * y_norm)
    sp = (vy - horizon) / max(1, screen_h - horizon)
    
    # 3-Lane Road Alignment
    lane_factor = x_meters / 3.5
    vx = int(cx + lane_factor * (62.1 + 553.8 * sp))
    scale = max(0.12, min(1.3, 28.0 / (z_clamped + 5.0)))
    return vx, vy, scale, sp


def generate_synthetic_frame(frame_idx: int, faults: Dict[str, Any], ego_speed: float, manager_ref: ConnectionManager) -> bytes:
    """
    Generates a 1280x720 synthetic camera frame with animated multiple traffic vehicles,
    diagonal cut-in vehicle collision trajectory, forward pedestrian crossing, and pothole hazards.
    """
    width, height = 1280, 720
    horizon = int(height * 0.46)
    cx = width // 2
    now = time.time()

    # Create image
    img = Image.new('RGB', (width, height), color=(8, 12, 20))
    draw = ImageDraw.Draw(img)

    # 1. Sky & Horizon
    draw.rectangle([0, 0, width, horizon], fill=(12, 18, 30))

    # City silhouettes
    for bx in range(0, width, 40):
        bh = max(5, int(20 + math.sin(bx * 0.1) * 12 + math.cos(bx * 0.05) * 8))
        draw.rectangle([bx, horizon - bh, bx + 32, horizon], fill=(6, 10, 16))

    # 2. Road surface (3 Lanes: Left, Center, Right)
    road_poly = [
        (cx - 90, horizon),
        (cx + 90, horizon),
        (width + 360, height),
        (-360, height)
    ]
    draw.polygon(road_poly, fill=(24, 30, 42))

    # Road Curbs
    draw.line([(cx - 90, horizon), (-360, height)], fill=(0, 240, 255), width=2)
    draw.line([(cx + 90, horizon), (width + 360, height)], fill=(0, 240, 255), width=2)

    # Moving Lane dashes (Moves ONLY if ego vehicle is moving)
    manager_ref.road_offset += (ego_speed * 1000 / 3600) * 0.033 * 6.0
    offset = manager_ref.road_offset % 100

    for s in range(12):
        progress = ((s / 12.0) + (offset / 100.0)) % 1.0
        p1 = progress ** 2.2
        p2 = min(1.0, progress + 0.04) ** 2.2

        y1 = int(horizon + p1 * (height - horizon))
        y2 = int(horizon + p2 * (height - horizon))

        spread1 = (y1 - horizon) / max(1, height - horizon)
        spread2 = (y2 - horizon) / max(1, height - horizon)

        # 2 Lane Dividers creating 3 lanes
        for lane_x in [-0.38, 0.38]:
            x1 = int(cx + (lane_x * 90) + lane_x * 520 * spread1)
            x2 = int(cx + (lane_x * 90) + lane_x * 520 * spread2)
            draw.line([(x1, y1), (x2, y2)], fill=(250, 204, 21), width=3)

    # 3. Pothole / Surface Hazard on Road (Ahead of ego car in center lane)
    if 'pothole_hazard' in faults:
        pothole_z = 14.0
        pothole_x = 0.3
        px, py, p_scale, _ = compute_screen_projection(pothole_x, pothole_z, horizon, width, height)
        
        pw = int(60 * p_scale)
        ph = int(24 * p_scale)
        # Deep asphalt crater hole
        draw.ellipse([px - pw // 2, py - ph // 2, px + pw // 2, py + ph // 2], fill=(6, 8, 12))
        draw.ellipse([px - int(pw * 0.4), py - int(ph * 0.35), px + int(pw * 0.4), py + int(ph * 0.35)], fill=(2, 3, 5))
        # Hazard outline
        draw.arc([px - pw // 2, py - ph // 2, px + pw // 2, py + ph // 2], 0, 360, fill=(255, 184, 0), width=2)
        draw.text((px - 25, py - ph - 12), "[POTHOLE]", fill=(255, 184, 0))

    # 4. Multi-Vehicle Traffic Simulation
    # A. Lead Vehicle in Center Lane (#101)
    lead_z = 38.0
    lead_x = math.sin(frame_idx * 0.04) * 0.35
    vx1, vy1, scale1, _ = compute_screen_projection(lead_x, lead_z, horizon, width, height)
    vw1 = int(90 * scale1)
    vh1 = int(60 * scale1)
    draw.rectangle([vx1 - vw1 // 2, vy1 - vh1, vx1 + vw1 // 2, vy1], fill=(0, 200, 255))
    draw.rectangle([vx1 - int(vw1 * 0.35), vy1 - int(vh1 * 0.9), vx1 + int(vw1 * 0.35), vy1 - int(vh1 * 0.55)], fill=(6, 11, 20))
    draw.rectangle([vx1 - vw1 // 2 + 2, vy1 - int(vh1 * 0.4), vx1 - int(vw1 * 0.25), vy1 - int(vh1 * 0.15)], fill=(255, 0, 40))
    draw.rectangle([vx1 + int(vw1 * 0.25), vy1 - int(vh1 * 0.4), vx1 + vw1 // 2 - 2, vy1 - int(vh1 * 0.15)], fill=(255, 0, 40))

    # B. Semi-Truck in Right Lane (#102 - aligned in center of right lane at x=+3.5m)
    truck_z = 44.0
    truck_x = 3.5
    vx2, vy2, scale2, _ = compute_screen_projection(truck_x, truck_z, horizon, width, height)
    vw2 = int(115 * scale2)
    vh2 = int(95 * scale2)
    # Truck Cargo Body & Cab
    draw.rectangle([vx2 - vw2 // 2, vy2 - vh2, vx2 + vw2 // 2, vy2], fill=(70, 90, 130))
    draw.rectangle([vx2 - int(vw2 * 0.45), vy2 - int(vh2 * 0.95), vx2 + int(vw2 * 0.45), vy2 - int(vh2 * 0.3)], fill=(140, 160, 190))
    draw.rectangle([vx2 - vw2 // 2 + 2, vy2 - int(vh2 * 0.25), vx2 - int(vw2 * 0.3), vy2 - int(vh2 * 0.1)], fill=(255, 120, 0))
    draw.rectangle([vx2 + int(vw2 * 0.3), vy2 - int(vh2 * 0.25), vx2 + vw2 // 2 - 2, vy2 - int(vh2 * 0.1)], fill=(255, 120, 0))

    # C. Adjacent / Cutting-In Sedan in Left Lane (#103 - aligned in center of left lane at x=-3.5m)
    has_cutin = 'cut_in_vehicle' in faults
    if has_cutin:
        fault_data = faults['cut_in_vehicle']
        elapsed = now - fault_data['time']
        dur = max(1.0, fault_data['duration'])
        alpha_cut = min(1.0, elapsed / dur)
        # Animate Car #103 smoothly sliding from left lane (x = -3.5m) into center ego lane (x = 0.0m)
        cut_x = -3.5 + (alpha_cut * 3.5)
        cut_z = max(10.5, 24.0 - (alpha_cut * 13.5))
        car_cut_col = (255, 42, 109)
    else:
        cut_x = -3.5
        cut_z = 24.0
        car_cut_col = (50, 180, 220)

    vx3, vy3, scale3, _ = compute_screen_projection(cut_x, cut_z, horizon, width, height)
    vw3 = int(90 * scale3)
    vh3 = int(60 * scale3)
    draw.rectangle([vx3 - vw3 // 2, vy3 - vh3, vx3 + vw3 // 2, vy3], fill=car_cut_col)
    draw.rectangle([vx3 - int(vw3 * 0.35), vy3 - int(vh3 * 0.9), vx3 + int(vw3 * 0.35), vy3 - int(vh3 * 0.55)], fill=(6, 11, 20))
    # Bright brake lights when cutting in
    tail_col = (255, 0, 50) if has_cutin else (180, 0, 30)
    draw.rectangle([vx3 - vw3 // 2 + 2, vy3 - int(vh3 * 0.45), vx3 - int(vw3 * 0.25), vy3 - int(vh3 * 0.2)], fill=tail_col)
    draw.rectangle([vx3 + int(vw3 * 0.25), vy3 - int(vh3 * 0.45), vx3 + vw3 // 2 - 2, vy3 - int(vh3 * 0.2)], fill=tail_col)

    # 5. Animated Jaywalking Pedestrian (Crossing cleanly across corridor at z = 16.0m)
    if 'pedestrian_jaywalking' in faults:
        fault_data = faults['pedestrian_jaywalking']
        elapsed = now - fault_data['time']
        dur = max(1.0, fault_data['duration'])
        alpha = min(1.0, elapsed / dur)

        # Pedestrian crosses in front of ego car at constant z=16m from x=-4.5m (left sidewalk) to x=+4.5m (right)
        ped_x = -4.5 + (alpha * 9.0)
        ped_z = 16.0

        ped_scr_x, ped_y, ped_scale, _ = compute_screen_projection(ped_x, ped_z, horizon, width, height)

        pw = int(28 * ped_scale)
        ph = int(68 * ped_scale)

        # Walking stride oscillation (moves only if time is passing)
        stride = math.sin(frame_idx * 0.4) * (14 * ped_scale)

        # Pedestrian Head
        head_r = int(7 * ped_scale)
        draw.ellipse([ped_scr_x - head_r, ped_y - ph, ped_scr_x + head_r, ped_y - ph + head_r * 2], fill=(255, 200, 100))

        # Pedestrian Torso
        torso_top = ped_y - ph + head_r * 2
        torso_bot = ped_y - int(ph * 0.4)
        draw.rectangle([ped_scr_x - int(pw * 0.35), torso_top, ped_scr_x + int(pw * 0.35), torso_bot], fill=(255, 60, 100))

        # Animated Walking Legs
        draw.line([(ped_scr_x - int(pw * 0.15), torso_bot), (ped_scr_x - int(pw * 0.15) + int(stride), ped_y)], fill=(40, 140, 255), width=max(2, int(4 * ped_scale)))
        draw.line([(ped_scr_x + int(pw * 0.15), torso_bot), (ped_scr_x + int(pw * 0.15) - int(stride), ped_y)], fill=(30, 110, 220), width=max(2, int(4 * ped_scale)))

        # Animated Walking Arms
        draw.line([(ped_scr_x - int(pw * 0.35), torso_top + int(6 * ped_scale)), (ped_scr_x - int(pw * 0.35) - int(stride * 0.8), torso_bot - int(4 * ped_scale))], fill=(255, 200, 100), width=max(2, int(3 * ped_scale)))
        draw.line([(ped_scr_x + int(pw * 0.35), torso_top + int(6 * ped_scale)), (ped_scr_x + int(pw * 0.35) + int(stride * 0.8), torso_bot - int(4 * ped_scale))], fill=(255, 200, 100), width=max(2, int(3 * ped_scale)))

        # Pulsing Hazard Warning Diamond over Pedestrian Head
        pulse = abs(math.sin(frame_idx * 0.3))
        warn_col = (255, int(42 + pulse * 100), int(109 + pulse * 80))
        dw = int(10 * ped_scale)
        draw.polygon([
            (ped_scr_x, ped_y - ph - int(18 * ped_scale)),
            (ped_scr_x + dw, ped_y - ph - int(12 * ped_scale)),
            (ped_scr_x, ped_y - ph - int(6 * ped_scale)),
            (ped_scr_x - dw, ped_y - ph - int(12 * ped_scale))
        ], fill=warn_col)

    # 6. Injected Fault Effects
    if 'weather_degradation' in faults:
        # Atmospheric Fog overlay
        fog_overlay = Image.new('RGBA', (width, height), (30, 45, 65, 110))
        img.paste(Image.blend(img, Image.new('RGB', (width, height), (35, 50, 70)), 0.35))
        
        # Animated Rain Streaks
        for r_idx in range(60):
            rx = (int(math.sin(r_idx * 17.3 + frame_idx * 0.1) * width * 0.5 + width * 0.5)) % width
            ry = (int(r_idx * 43 + frame_idx * 32)) % height
            rlen = 18 + (r_idx % 12)
            draw.line([(rx, ry), (rx - 4, ry + rlen)], fill=(180, 215, 255), width=max(1, (r_idx % 3)))

        # Animated Windshield Wiper Sweep
        wiper_angle = math.sin(frame_idx * 0.25) * 0.85
        w_cx = width // 2
        w_cy = height - 15
        w_len = 340
        w_tip_x = int(w_cx + math.sin(wiper_angle) * w_len)
        w_tip_y = int(w_cy - math.cos(wiper_angle) * w_len)
        draw.line([(w_cx, w_cy), (w_tip_x, w_tip_y)], fill=(70, 90, 120), width=6)
        draw.line([(w_cx, w_cy), (w_tip_x, w_tip_y)], fill=(0, 240, 255), width=2)

    if 'sensor_blindspot' in faults:
        draw.rectangle([int(width * 0.6), 0, width, height], fill=(180, 0, 40))
        draw.text((int(width * 0.62), 50), "[SENSOR BLINDSPOT OCCLUDED]", fill=(255, 255, 255))

    # 7. Dashcam Hood
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
                manager.ego_speed,
                manager
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
    pedestrian counts, hazard events counter, path deviation analytics, and AV decisions.
    """
    await manager.connect_telemetry(websocket)
    send_lock = asyncio.Lock()

    async def safe_send_text(text: str):
        try:
            async with send_lock:
                await websocket.send_text(text)
        except Exception:
            pass
    
    async def receiver_loop():
        try:
            while True:
                msg_text = await websocket.receive_text()
                data = json.loads(msg_text)
                
                # Check for ping
                if data.get("type") == "ping":
                    await safe_send_text(json.dumps({
                        "type": "pong",
                        "clientTimestamp": data.get("clientTimestamp")
                    }))
                    continue
                
                # Process Fault Injections & Control Commands
                action = data.get("action")
                fault_type = data.get("faultType") or data.get("fault_type")
                
                if action == "reset_journey" or action == "reset_simulation":
                    manager.reset_journey()
                elif action == "complete_journey":
                    manager.complete_journey()
                elif action in ["clear_faults"]:
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
                await safe_send_text(json.dumps({
                    "status": "acknowledged",
                    "action": action,
                    "active_faults": list(manager.active_faults.keys()),
                    "hazard_events_tackled": manager.hazard_events_tackled,
                    "total_pedestrians_detected": manager.total_pedestrians_detected,
                    "journey_status": manager.journey_status
                }))
        except WebSocketDisconnect:
            pass
        except Exception as e:
            import traceback
            print(f"[WebSocket Receiver Error]: {e}")
            traceback.print_exc()

    async def sender_loop():
        try:
            while True:
                now = time.time()
                # Clean expired faults
                for k in list(manager.active_faults.keys()):
                    fault_info = manager.active_faults[k]
                    if now - fault_info["time"] > fault_info["duration"]:
                        del manager.active_faults[k]

                has_cutin = 'cut_in_vehicle' in manager.active_faults
                has_ped = 'pedestrian_jaywalking' in manager.active_faults
                has_sudden_brake = 'sudden_braking' in manager.active_faults
                has_blindspot = 'sensor_blindspot' in manager.active_faults
                has_weather = 'weather_degradation' in manager.active_faults
                has_pothole = 'pothole_hazard' in manager.active_faults
                has_emergency = 'emergency_stop' in manager.active_faults


                # 1. Synthesize 3D Multi-Vehicle & Road Target Perception
                objects_3d = []
                now = time.time()

                # A. Lead Vehicle in Center Lane (#101)
                lead_z = 38.0
                lead_x = math.sin(manager.frame_count * 0.04) * 0.35
                objects_3d.append({
                    "id": 101,
                    "class": "car",
                    "x": round(lead_x, 2),
                    "y": 0.0,
                    "z": lead_z,
                    "relative_velocity": 0.5,
                    "is_converging": False
                })

                # B. Commercial Semi-Truck in Right Lane (#102 - aligned in center of right lane at x=+3.5m)
                objects_3d.append({
                    "id": 102,
                    "class": "truck",
                    "x": 3.5,
                    "y": 0.0,
                    "z": 44.0,
                    "relative_velocity": -2.0,
                    "is_converging": False
                })

                # C. Adjacent / Cut-In Sedan in Left Lane (#103 - aligned in center of left lane at x=-3.5m)
                if has_cutin:
                    fault_info = manager.active_faults["cut_in_vehicle"]
                    elapsed = now - fault_info["time"]
                    dur = max(1.0, fault_info["duration"])
                    alpha_cut = min(1.0, elapsed / dur)
                    cut_x = -3.5 + (alpha_cut * 3.5)
                    cut_z = max(10.5, 24.0 - (alpha_cut * 13.5))
                    cut_rel_vel = 12.0
                else:
                    cut_x = -3.5
                    cut_z = 24.0
                    cut_rel_vel = 0.0

                objects_3d.append({
                    "id": 103,
                    "class": "car",
                    "x": round(cut_x, 2),
                    "y": 0.0,
                    "z": round(cut_z, 1),
                    "relative_velocity": round(cut_rel_vel, 1),
                    "is_converging": has_cutin
                })

                # D. Pothole / Road Surface Crater Hazard (#501)
                if has_pothole:
                    objects_3d.append({
                        "id": 501,
                        "class": "obstacle",
                        "x": 0.3,
                        "y": 0.0,
                        "z": 14.0,
                        "relative_velocity": round(manager.ego_speed * 1000 / 3600, 1),
                        "is_converging": True
                    })

                # E. Jaywalking Pedestrian Crossing in Front of Car (#777)
                active_peds = 0
                ped_z = 16.0
                if has_ped:
                    fault_info = manager.active_faults["pedestrian_jaywalking"]
                    elapsed = now - fault_info["time"]
                    dur = max(1.0, fault_info["duration"])
                    alpha = min(1.0, elapsed / dur)

                    # Dynamic crossing: starts at x=-4.5 (left curb), crosses smoothly to x=+4.5 (right)
                    ped_x = -4.5 + (alpha * 9.0)
                    ped_z = 16.0
                    ped_rel_vel = 10.5
                    
                    ped_id = 777
                    if ped_id not in manager.detected_pedestrian_ids:
                        manager.detected_pedestrian_ids.add(ped_id)
                        manager.total_pedestrians_detected += 1
                    active_peds += 1

                    objects_3d.append({
                        "id": ped_id,
                        "class": "pedestrian",
                        "x": round(ped_x, 2),
                        "y": 0.0,
                        "z": round(ped_z, 1),
                        "relative_velocity": round(ped_rel_vel, 1),
                        "is_converging": True,
                        "crossing_progress": round(alpha, 2),
                        "heading_deg": 90.0
                    })

                manager.active_pedestrians_count = active_peds

                # 2. Update Path Deviation & Distance Travelled
                if manager.journey_status != "COMPLETED":
                    dt = 0.05
                    manager.total_distance_travelled += (manager.ego_speed * 1000 / 3600) * dt
                    
                    # Evasive swerve or lane keeping deviation calculation
                    if has_pothole:
                        # Evasive right lane deviation around pothole
                        manager.lateral_offset = 0.85
                    elif has_ped:
                        manager.lateral_offset = 0.0
                    elif has_cutin:
                        manager.lateral_offset = 0.65
                    elif has_blindspot:
                        manager.lateral_offset = 0.45
                    elif has_weather:
                        manager.lateral_offset = math.sin(manager.frame_count * 0.04) * 0.18
                    else:
                        manager.lateral_offset = math.sin(manager.frame_count * 0.03) * 0.08

                    current_dev = abs(manager.lateral_offset)
                    manager.current_path_deviation = current_dev
                    manager.max_path_deviation = max(manager.max_path_deviation, current_dev)
                    manager.deviation_samples_count += 1
                    manager.avg_path_deviation = (
                        (manager.avg_path_deviation * (manager.deviation_samples_count - 1)) + current_dev
                    ) / manager.deviation_samples_count

                # 3. Run Decision Engine
                result = manager.decision_engine.evaluate_hazard_event_ml(objects_3d, ego_speed=manager.ego_speed)
                action = result["action"]
                reasoning = result["hypotheses_reasoning"]
                risk_level = result.get("risk_level", "LOW")
                manager.last_inference_latency = result.get("latency_ms", 0.0)

                # 4. Vehicle Dynamics & Stopping Logic
                if has_emergency or manager.journey_status == "COMPLETED":
                    action = "Emergency Braking: Operator Takeover" if has_emergency else "Journey Completed (Stop)"
                    manager.ego_speed = max(0.0, manager.ego_speed - 45.0 * 0.05)
                    manager.brake_pressure = 100
                elif has_ped:
                    # Car STOPS completely when pedestrian is crossing in front
                    action = "Emergency Braking: Yielding to Pedestrian #777"
                    reasoning["Brake"] = f"CRITICAL: Full stop applied. Yielding to Jaywalking Pedestrian #777 at {ped_z:.1f}m."
                    manager.ego_speed = max(0.0, manager.ego_speed - 45.0 * 0.05)
                    manager.brake_pressure = 100
                    risk_level = "HIGH"
                elif has_pothole:
                    action = "Swerve: Evasive Maneuver around Pothole"
                    reasoning["Swerve"] = "OPTIMAL: Executing 0.85m lateral swerve to bypass pavement crater."
                    reasoning["Maintain"] = "REJECTED: High risk of tire puncture and suspension damage."
                    manager.ego_speed = max(35.0, manager.ego_speed - 15.0 * 0.05)
                    manager.brake_pressure = 40
                    risk_level = "MEDIUM"
                elif has_blindspot:
                    action = "Emergency Braking: Sensor Blindspot Occlusion"
                    reasoning["Brake"] = "ACCEPTED: Right sector camera/LIDAR occluded. Engaging safety brake deceleration."
                    manager.ego_speed = max(0.0, manager.ego_speed - 30.0 * 0.05)
                    manager.brake_pressure = 85
                    risk_level = "HIGH"
                elif has_sudden_brake:
                    action = "Emergency Braking: Lead Vehicle Hard Stop"
                    manager.ego_speed = max(10.0, manager.ego_speed - 35.0 * 0.05)
                    manager.brake_pressure = 90
                    risk_level = "HIGH"
                elif has_cutin:
                    action = "Brake: Yielding to Cut-In Vehicle #103"
                    reasoning["Brake"] = f"CRITICAL: Vehicle #103 cut into lane at {cut_z:.1f}m. Safety brake applied."
                    manager.ego_speed = max(20.0, manager.ego_speed - 28.0 * 0.05)
                    manager.brake_pressure = 80
                    risk_level = "HIGH"
                elif has_weather:
                    action = "Slow: Adverse Weather Speed Restriction"
                    reasoning["Maintain"] = "REJECTED: High precipitation & slippery road friction."
                    reasoning["Brake"] = "ACCEPTED: Speed restricted to 45 km/h for hydroplaning prevention."
                    manager.target_speed = 45.0
                    if manager.ego_speed > 45.0:
                        manager.ego_speed = max(45.0, manager.ego_speed - 12.0 * 0.05)
                        manager.brake_pressure = 35
                    else:
                        manager.brake_pressure = 0
                    risk_level = "MEDIUM"
                elif action.startswith("Brake") or risk_level == "HIGH":
                    manager.ego_speed = max(0.0, manager.ego_speed - 20.0 * 0.05)
                    manager.brake_pressure = 60
                elif action.startswith("Slow") or risk_level == "MEDIUM":
                    manager.ego_speed = max(30.0, manager.ego_speed - 10.0 * 0.05)
                    manager.brake_pressure = 30
                else:
                    manager.target_speed = 70.0
                    manager.brake_pressure = 0
                    if manager.ego_speed < manager.target_speed:
                        manager.ego_speed = min(manager.target_speed, manager.ego_speed + 6.0 * 0.05)

                # 5. Hazard Event State Machine (Increments for Pedestrians, Blindspot, Cut-in, Sudden Brake, Weather, Pothole, E-Stop)
                is_hazard_now = (
                    has_ped or has_cutin or has_sudden_brake or has_emergency or has_blindspot or has_weather or has_pothole
                    or risk_level in ["HIGH", "MEDIUM"] 
                    or action not in ["Maintain Course", "Maintain"]
                    or manager.brake_pressure > 0
                )

                if is_hazard_now and not manager.in_hazard_state:
                    manager.hazard_events_tackled += 1
                    manager.in_hazard_state = True
                elif not is_hazard_now:
                    manager.in_hazard_state = False

                manager.last_action = action



                # 5. Compute 2D bounding boxes, TTC, and Trajectory Prediction Ribbons
                tracked_objects = []
                min_ttc = float('inf')
                most_crit = None

                for obj in objects_3d:
                    rel_vel = obj.get("relative_velocity", 8.0)
                    ttc = manager.decision_engine.calculate_ttc(obj["z"], rel_vel)
                    if ttc < min_ttc and abs(obj["x"]) < 2.0:
                        min_ttc = ttc
                        most_crit = obj

                    # Screen projection coordinates matching synthetic video stream
                    x_scr, y_scr, scale, _ = compute_screen_projection(obj["x"], obj["z"], 331, 1280, 720)
                    
                    is_ped_obj = obj["class"] == "pedestrian"
                    is_truck_obj = obj["class"] == "truck"
                    bw = int((35 if is_ped_obj else (115 if is_truck_obj else 90)) * scale)
                    bh = int((75 if is_ped_obj else (95 if is_truck_obj else 60)) * scale)

                    risk = "CRITICAL" if ttc < 2.5 or (is_ped_obj and abs(obj["x"]) < 1.5) else "CAUTION" if ttc < 4.5 else "SAFE"

                    # Generate trajectory ribbons (for pedestrian: shows dynamic lateral crossing vector)
                    if is_ped_obj:
                        traj = [
                            {"x": x_scr, "y": y_scr, "timeOffsetSec": 0},
                            {"x": x_scr + int(24 * scale), "y": y_scr - 15, "timeOffsetSec": 0.5},
                            {"x": x_scr + int(48 * scale), "y": y_scr - 30, "timeOffsetSec": 1.0},
                        ]
                    else:
                        traj = [
                            {"x": x_scr, "y": y_scr, "timeOffsetSec": 0},
                            {"x": x_scr, "y": y_scr - 25, "timeOffsetSec": 0.5},
                            {"x": x_scr, "y": y_scr - 50, "timeOffsetSec": 1.0},
                        ]

                    tracked_objects.append({
                        "id": obj["id"],
                        "class": obj["class"],
                        "bbox": [x_scr - bw // 2, y_scr - bh, x_scr + bw // 2, y_scr],
                        "confidence": 0.98 if is_ped_obj else 0.96,
                        "distance": round(obj["z"], 1),
                        "relativeVelocity": round(rel_vel, 1),
                        "ttc": round(ttc, 1) if ttc != float('inf') else 99.9,
                        "riskLevel": risk,
                        "trajectory": traj,
                        "position3D": obj
                    })

                # Calculate Lane Keeping Precision Score (100% - error factor)
                lane_precision = max(60.0, min(100.0, 100.0 - (manager.avg_path_deviation * 22.0)))

                # Autonomous Sensor Allocation & Gating
                sensors_state, sensor_rationale = orchestrate_sensors(
                    has_ped=has_ped,
                    has_cutin=has_cutin,
                    has_sudden_brake=has_sudden_brake,
                    has_weather=has_weather,
                    has_blindspot=has_blindspot,
                    has_pothole=has_pothole,
                    speed=manager.ego_speed
                )


                # Journey Summary & Duration Metrics
                manager.trip_max_speed = max(manager.trip_max_speed, manager.ego_speed)
                manager.speed_sum += manager.ego_speed
                manager.speed_samples_count += 1
                avg_speed = manager.speed_sum / max(1, manager.speed_samples_count)
                
                journey_dur = (manager.journey_end_time or time.time()) - manager.journey_start_time
                safety_grade = (
                    "A+ (99.4%)" if (manager.avg_path_deviation < 0.12 and manager.max_path_deviation < 1.0)
                    else "A (96.8%)" if manager.avg_path_deviation < 0.28
                    else "B+ (91.2%)"
                )

                journey_summary = {
                    "status": manager.journey_status,
                    "durationSeconds": round(journey_dur, 1),
                    "durationFormatted": f"{int(journey_dur // 60)}m {int(journey_dur % 60)}s",
                    "totalDistanceMeters": round(manager.total_distance_travelled, 1),
                    "totalDistanceKm": round(manager.total_distance_travelled / 1000, 2),
                    "averageSpeedKmh": round(avg_speed, 1),
                    "maxSpeedKmh": round(manager.trip_max_speed, 1),
                    "hazardEventsTackled": manager.hazard_events_tackled,
                    "activePedestriansCount": manager.active_pedestrians_count,
                    "totalPedestriansDetected": manager.total_pedestrians_detected,
                    "avgPathDeviationMeters": round(manager.avg_path_deviation, 3),
                    "maxPathDeviationMeters": round(manager.max_path_deviation, 3),
                    "laneKeepingPrecisionPct": round(lane_precision, 1),
                    "aiSafetyGrade": safety_grade,
                    "sensorGatingEfficiency": "99.8% Optimal",
                    "sensorAllocationRationale": sensor_rationale
                }

                packet = {
                    "timestamp": int(time.time() * 1000),
                    "frameId": manager.frame_count,
                    "objects": tracked_objects,
                    "decision": {
                        "id": f"dec-{manager.frame_count}",
                        "timestamp": time.strftime("%H:%M:%S") + f".{int(time.time() * 10) % 10}",
                        "action": action,
                        "confidence": 0.96 - (0.2 if has_blindspot else 0.0),
                        "targetSpeedKmh": round(manager.target_speed if action.startswith("Maintain") else 35 if action.startswith("Slow") else 0, 1),
                        "reasoning": reasoning,
                        "primaryReason": reasoning.get(action, "Nominal autonomous cruising along safety envelope."),
                        "urgency": "critical" if min_ttc < 2.5 or has_emergency or has_ped else "medium" if min_ttc < 4.5 else "low"
                    },
                    "metrics": {
                        "speedKmh": round(manager.ego_speed, 1),
                        "speedMph": round(manager.ego_speed * 0.621371, 1),
                        "targetSpeedKmh": manager.target_speed,
                        "steeringAngleDeg": round(manager.lateral_offset * 12.0 + math.sin(manager.frame_count * 0.03) * 1.5, 1),
                        "accelerationG": -0.55 if manager.brake_pressure > 40 else -0.15 if manager.brake_pressure > 0 else 0.08,
                        "lateralG": round(manager.lateral_offset * 0.15, 2),
                        "brakePressurePct": manager.brake_pressure,
                        "throttlePct": 0 if manager.brake_pressure > 0 else manager.throttle,
                        "gear": "D",
                        "driveMode": "EMERGENCY_STOP" if has_emergency else "MANUAL_OVERRIDE" if has_blindspot else "AUTONOMOUS",
                        "batterySoc": 91,
                        "distanceToLeadVehicle": lead_z,
                        "sensorStatus": sensors_state,
                        "sensorOrchestration": {
                            "matrix": sensors_state,
                            "rationale": sensor_rationale
                        },
                        "totalDistanceTravelledMeters": round(manager.total_distance_travelled, 2),
                        "hazardEventsTackled": manager.hazard_events_tackled,
                        "activePedestriansCount": manager.active_pedestrians_count,
                        "totalPedestriansDetected": manager.total_pedestrians_detected,
                        "pathDeviation": {
                            "currentMeters": round(manager.current_path_deviation, 3),
                            "avgMeters": round(manager.avg_path_deviation, 3),
                            "maxMeters": round(manager.max_path_deviation, 3),
                            "laneKeepingPrecisionPct": round(lane_precision, 1),
                            "journeyStatus": manager.journey_status
                        },
                        "journeySummary": journey_summary,
                        "inferenceLatencyMs": round(manager.last_inference_latency, 2)
                    },
                    "ttcAlert": {
                        "level": "CRITICAL" if (min_ttc < 2.5 or has_ped) else "CAUTION" if (min_ttc < 4.5 or has_weather) else "SAFE",
                        "ttcSeconds": round(min_ttc, 1) if min_ttc != float('inf') else 99.9,
                        "targetId": most_crit["id"] if most_crit else (777 if has_ped else None),
                        "targetClass": most_crit["class"] if most_crit else ("pedestrian" if has_ped else None),
                        "distanceMeters": most_crit["z"] if most_crit else (ped_z if has_ped else None),
                        "message": (
                            f"⚠️ CRITICAL: Jaywalking Pedestrian #777 crossing active corridor at {ped_z:.1f}m!" if has_ped
                            else "🌧️ CAUTION: Adverse Weather Degradation. Wet road traction speed limit (45 km/h) active." if has_weather
                            else "🚫 CRITICAL: Right sector sensor occluded. Safety brake applied." if has_blindspot
                            else f"⚠️ CRITICAL: Time-To-Collision threshold breached with Lead Vehicle #{most_crit['id']}!" if min_ttc < 2.5
                            else "All travel corridors clear."
                        )
                    },
                    "activeFaults": list(manager.active_faults.keys())
                }


                await safe_send_text(json.dumps(packet))
                await asyncio.sleep(0.05) # 20 Hz
        except WebSocketDisconnect:
            pass
        except Exception as e:
            import traceback
            print(f"[WebSocket Sender Error]: {e}")
            traceback.print_exc()

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

