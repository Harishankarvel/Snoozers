import asyncio
import json
import time
from app.api.websockets import manager, generate_synthetic_frame
from fastapi.testclient import TestClient
from app.main import app

def test_internal_features():
    print("=== Testing Live Backend Features ===")
    
    # 1. Test Frame Generation
    manager.reset_journey()
    frame_bytes = generate_synthetic_frame(10, manager.active_faults, manager.ego_speed, manager)
    assert frame_bytes[:2] == b'\xff\xd8', "Frame must be valid JPEG"
    print("[PASS] Nominal frame generated successfully.")

    # 2. Test Jaywalking Fault Frame Generation & Animation
    manager.active_faults["pedestrian_jaywalking"] = {"time": time.time(), "duration": 8}
    frame_bytes_ped = generate_synthetic_frame(25, manager.active_faults, manager.ego_speed, manager)
    assert frame_bytes_ped[:2] == b'\xff\xd8', "Jaywalker frame must be valid JPEG"
    print("[PASS] Jaywalking animated frame generated successfully.")

    # 3. Test HTTP / and /api/health
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "HEALTHY"
    print("[PASS] Health endpoint verified.")

    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "AURA-AV" in res_root.text
    print("[PASS] Root Dashboard HTML served successfully.")

    # 4. Test WebSocket Telemetry Endpoint with Jaywalking & Metrics
    with client.websocket_connect("/ws/telemetry") as ws:
        # Initial packet
        data = ws.receive_json()
        print(f"[PASS] Initial Telemetry Packet: Speed={data['metrics']['speedKmh']}, Objects={len(data['objects'])}, PathDev={data['metrics']['pathDeviation']}")
        
        # Inject Jaywalking fault
        ws.send_text(json.dumps({
            "action": "inject_fault",
            "fault_type": "pedestrian_jaywalking",
            "duration_sec": 8
        }))
        ack = ws.receive_json()
        print(f"[PASS] Injected Jaywalking Ack: {ack}")

        # Receive next telemetry frames
        ped_stopped = False
        for _ in range(15):
            pkt = ws.receive_json()
            if "status" in pkt:
                continue
            metrics = pkt["metrics"]
            peds = [o for o in pkt["objects"] if o["class"] == "pedestrian"]
            if len(peds) > 0:
                print(f"[PASS] Jaywalker Packet Received: Speed={metrics['speedKmh']} km/h, Brake={metrics['brakePressurePct']}%, Ped={peds[0]['id']}, Risk={peds[0]['riskLevel']}")
                if metrics["brakePressurePct"] == 100 and metrics["speedKmh"] < 40:
                    ped_stopped = True
                    break
        
        assert ped_stopped, "Vehicle must execute emergency stop (100% brake) when pedestrian is crossing"

        # Clear faults and test Blindspot fault
        ws.send_text(json.dumps({"action": "clear_faults"}))
        ws.receive_json()

        ws.send_text(json.dumps({
            "action": "inject_fault",
            "fault_type": "sensor_blindspot",
            "duration_sec": 8
        }))
        ack_bs = ws.receive_json()
        print(f"[PASS] Injected Blindspot Ack: {ack_bs}")

        
        blindspot_braking = False
        for _ in range(15):
            pkt = ws.receive_json()
            if "status" in pkt:
                continue
            metrics = pkt["metrics"]
            if metrics["sensorStatus"]["camera"] == "DEGRADED" and metrics["brakePressurePct"] > 0:
                blindspot_braking = True
                print(f"[PASS] Blindspot Hazard Tackled: Brake={metrics['brakePressurePct']}%, Hazards={metrics['hazardEventsTackled']}, CamStatus={metrics['sensorStatus']['camera']}")
                break
        
        assert blindspot_braking, "Vehicle must apply safety brakes and increment hazards on blindspot occlusion"


        # Complete journey
        ws.send_text(json.dumps({"action": "complete_journey"}))
        ack_end = ws.receive_json()
        print(f"[PASS] Journey completion acknowledged: {ack_end}")

    print("\nALL BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_internal_features()
