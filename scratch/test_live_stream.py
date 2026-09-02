import asyncio
import json
import websockets

async def test_live():
    uri_tel = 'ws://127.0.0.1:8000/ws/telemetry'
    print(f'[Connecting to Telemetry WebSocket]: {uri_tel}')
    
    async with websockets.connect(uri_tel) as ws:
        # Helper to read next telemetry packet (skipping ack echoes)
        async def get_next_telemetry():
            while True:
                raw = await ws.recv()
                data = json.loads(raw)
                if 'decision' in data:
                    return data

        # 1. Receive initial nominal packet
        pkt = await get_next_telemetry()
        print('\n=== INITIAL NOMINAL TELEMETRY PACKET ===')
        print(f"Frame ID: {pkt.get('frameId')}")
        print(f"Ego Speed: {pkt['metrics']['speedKmh']} km/h | Target: {pkt['metrics']['targetSpeedKmh']} km/h")
        print(f"Decision: {pkt['decision']['action']} (Confidence: {pkt['decision']['confidence']})")
        print(f"Sensor Arbitration: {pkt.get('sensorConfidence', {}).get('arbitration', {}).get('override_reason')}")
        print(f"Sensor Status: {pkt['metrics']['sensorStatus']}")

        # 2. Inject Weather Degradation (Fog)
        print('\n--> INJECTING FAULT: weather_degradation (Fog & Low Optical Visibility)...')
        await ws.send(json.dumps({'action': 'inject_fault', 'faultType': 'weather_degradation', 'durationSec': 8}))

        # 3. Read subsequent frames to observe confidence evolution & arbitration
        print('\n=== LIVE SENSOR CONFIDENCE EVOLUTION & ARBITRATION ===')
        for i in range(8):
            pkt = await get_next_telemetry()
            conf = pkt.get('sensorConfidence', {}).get('current', {})
            arb = pkt.get('sensorConfidence', {}).get('arbitration', {})
            cam_pct = conf.get('camera', {}).get('confidencePct', 0)
            cam_trend = conf.get('camera', {}).get('trend', '')
            cam_reason = conf.get('camera', {}).get('reason', '')
            radar_pct = conf.get('radar', {}).get('confidencePct', 0)
            dominant = arb.get('dominant_sensor', '')
            action = pkt['decision']['action']
            print(f"[Frame {pkt.get('frameId'):>3}] Action: {action:<30} | CAM: {cam_pct:>5.1f}% ({cam_trend:<7}, [{cam_reason}]) | RADAR: {radar_pct:>5.1f}% | Dominant: {dominant}")

        # 4. Inject Jaywalking Pedestrian
        print('\n--> INJECTING FAULT: pedestrian_jaywalking (Cross-walk Intrusion)...')
        await ws.send(json.dumps({'action': 'inject_fault', 'faultType': 'pedestrian_jaywalking', 'durationSec': 8}))

        for i in range(6):
            pkt = await get_next_telemetry()
            peds = pkt['metrics'].get('activePedestriansCount', 0)
            ttc = pkt['ttcAlert']['ttcSeconds']
            action = pkt['decision']['action']
            msg_str = pkt['ttcAlert']['message'].encode('ascii', 'replace').decode('ascii')
            print(f"[Frame {pkt.get('frameId'):>3}] Action: {action:<45} | Active Peds: {peds} | TTC: {ttc}s | Alert: {msg_str}")

asyncio.run(test_live())
