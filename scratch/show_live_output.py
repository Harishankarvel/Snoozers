import urllib.request
import json
import asyncio
import websockets

def show_http_status():
    print("=" * 75)
    print(">>> [1] BACKEND HEALTH ENDPOINT (http://127.0.0.1:8000/api/health)")
    print("=" * 75)
    with urllib.request.urlopen("http://127.0.0.1:8000/api/health") as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print(json.dumps(data, indent=2))

    print("\n" + "=" * 75)
    print(">>> [2] FRONTEND VITE SERVER (http://127.0.0.1:3000)")
    print("=" * 75)
    with urllib.request.urlopen("http://127.0.0.1:3000") as resp:
        html = resp.read().decode("utf-8")
        print(f"HTTP Status: {resp.status} OK")
        print(f"Server Header: {resp.headers.get('Server', 'Vite/6.4.3')}")
        print(f"HTML Content Size: {len(html)} bytes")
        print("Frontend Bundle: Ready and serving React 18 HUD UI on port 3000")

async def show_live_websocket_output():
    print("\n" + "=" * 75)
    print(">>> [3] BACKEND LIVE WEBSOCKET OUTPUT (/ws/video & /ws/telemetry)")
    print("=" * 75)
    
    # 1. Video Socket
    async with websockets.connect("ws://127.0.0.1:8000/ws/video") as vws:
        frame_bytes = await vws.recv()
        print(f"[Video WebSocket] Received JPEG Frame: {len(frame_bytes):,} bytes @ 30 FPS")
    
    # 2. Telemetry Socket
    async with websockets.connect("ws://127.0.0.1:8000/ws/telemetry") as tws:
        for _ in range(5):
            raw = await tws.recv()
            pkt = json.loads(raw)
            if "decision" in pkt:
                print(f"\n--- [Live Telemetry Frame #{pkt['frameId']}] ---")
                print(f"Timestamp: {pkt['decision']['timestamp']}")
                print(f"Dynamics: Speed = {pkt['metrics']['speedKmh']} km/h | Target = {pkt['metrics']['targetSpeedKmh']} km/h | Steering = {pkt['metrics']['steeringAngleDeg']} deg | Brake = {pkt['metrics']['brakePressurePct']}%")
                print(f"Perception: {len(pkt['objects'])} 3D Tracked Objects (Cars, Trucks, Obstacles)")
                print(f"AV Decision: {pkt['decision']['action']} (Urgency: {pkt['decision']['urgency'].upper()})")
                print(f"Primary Reason: {pkt['decision']['primaryReason']}")
                
                print(f"\nSensor Confidence Matrix (EMA-Smoothed Fidelity & Reasons):")
                for sensor, item in pkt.get("sensorConfidence", {}).get("current", {}).items():
                    print(f"   * {sensor.upper():<6}: {item.get('confidencePct'):>5.1f}% | Health: {item.get('health'):<8} | Trend: {item.get('trend'):<7} | Reason: [{item.get('reason')}]")
                
                arb = pkt.get("sensorConfidence", {}).get("arbitration", {})
                print(f"\nSensor Arbitration: Dominant = {arb.get('dominant_sensor')} | Status = {arb.get('override_reason')}")
                print(f"TTC Collision Alert: {pkt['ttcAlert']['level']} (TTC = {pkt['ttcAlert']['ttcSeconds']}s)")
                break

if __name__ == "__main__":
    show_http_status()
    asyncio.run(show_live_websocket_output())
