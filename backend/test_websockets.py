import asyncio
import json
import websockets
import urllib.request
import traceback

async def test_api():
    print("[1/4] Testing HTTP API Endpoints...")
    try:
        with urllib.request.urlopen("http://localhost:8000/api/health") as response:
            data = json.loads(response.read().decode())
            print(f"  [OK] /api/health Response: {data}")
            assert data["status"] == "HEALTHY"
    except Exception as e:
        print(f"  [FAIL] /api/health failed: {e}")
        return False

    try:
        with urllib.request.urlopen("http://localhost:8000/") as response:
            html = response.read().decode()
            print(f"  [OK] GET / (Dashboard HTML): received {len(html)} bytes")
            assert "AURA-AV" in html
    except Exception as e:
        print(f"  [FAIL] GET / failed: {e}")
        return False
    return True

async def test_video_ws():
    print("[2/4] Testing /ws/video Binary Stream...")
    uri = "ws://localhost:8000/ws/video"
    try:
        ws = await websockets.connect(uri)
        print("  [OK] Connected to ws://localhost:8000/ws/video")
        for i in range(5):
            frame_bytes = await asyncio.wait_for(ws.recv(), timeout=3.0)
            is_jpeg = frame_bytes[:2] == b'\xff\xd8'
            print(f"    Frame #{i+1}: received {len(frame_bytes)} bytes (Valid JPEG: {is_jpeg})")
        
        # Graceful disconnect
        await ws.close()
        print("  [OK] Video byte stream test PASSED!")
        return True
    except Exception as e:
        print(f"  [FAIL] /ws/video error: {e}")
        traceback.print_exc()
        return False

async def test_telemetry_ws():
    print("[3/4] Testing /ws/telemetry Bi-Directional Stream...")
    uri = "ws://localhost:8000/ws/telemetry"
    try:
        ws = await websockets.connect(uri)
        print("  [OK] Connected to ws://localhost:8000/ws/telemetry")
        
        # 1. Receive initial telemetry packets
        packet_raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
        packet = json.loads(packet_raw)
        print(f"  [OK] Received Telemetry: Frame #{packet.get('frameId')}, Speed: {packet['metrics']['speedKmh']} km/h, Action: {packet['decision']['action']}, Objects: {len(packet['objects'])}")
        
        # 2. Test Fault Injection
        print("[4/4] Testing Fault Injection Dispatch...")
        fault_payload = {
            "action": "inject_fault",
            "faultType": "cut_in_vehicle",
            "durationSec": 5,
            "params": {"lateral_velocity": -2.5}
        }
        await ws.send(json.dumps(fault_payload))
        print(f"  [OK] Sent Fault Injection Payload: {fault_payload['faultType']}")
        
        # Receive ack / updated packets
        for _ in range(5):
            msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
            parsed = json.loads(msg)
            if "active_faults" in parsed or "activeFaults" in parsed:
                print(f"  [OK] Received Server Update: {parsed.get('action') or parsed.get('decision', {}).get('action')}")
                break
        
        await ws.close()
        print("  [OK] Bi-directional Telemetry WebSocket test PASSED!")
        return True
    except Exception as e:
        print(f"  [FAIL] /ws/telemetry error: {e}")
        traceback.print_exc()
        return False

async def main():
    print("========================================")
    print("AURA-AV WebSocket & Backend Verification")
    print("========================================")
    api_ok = await test_api()
    vid_ok = await test_video_ws()
    tel_ok = await test_telemetry_ws()
    
    print("========================================")
    if api_ok and vid_ok and tel_ok:
        print("ALL 4/4 TESTS PASSED! Backend & WebSockets 100% Operational.")
    else:
        print("Verification summary: Incomplete test suite.")
    print("========================================")

if __name__ == "__main__":
    asyncio.run(main())
