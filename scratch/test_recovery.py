import asyncio
import json
import websockets

async def test_recovery():
    async with websockets.connect('ws://127.0.0.1:8000/ws/telemetry') as ws:
        await ws.send(json.dumps({'action': 'inject_fault', 'faultType': 'sudden_brake', 'durationSec': 2}))
        print('=== 1. HANDBRAKE FOR 2 SECONDS ===')
        for i in range(12):
            pkt = json.loads(await ws.recv())
            if 'metrics' in pkt:
                m = pkt['metrics']
                print(f"Speed: {m['speedKmh']:>4.1f} km/h | Brake: {m['brakePressurePct']:>3}% | Throttle: {m['throttlePct']:>3}% | LeadDist: {m['distanceToLeadVehicle']:>4.1f}m | Action: {pkt['decision']['action']}")
        
        print('\n=== 2. ACCELERATING BACK TO CRUISE ===')
        for i in range(12):
            pkt = json.loads(await ws.recv())
            if 'metrics' in pkt:
                m = pkt['metrics']
                print(f"Speed: {m['speedKmh']:>4.1f} km/h | Brake: {m['brakePressurePct']:>3}% | Throttle: {m['throttlePct']:>3}% | LeadDist: {m['distanceToLeadVehicle']:>4.1f}m | Action: {pkt['decision']['action']}")

if __name__ == '__main__':
    asyncio.run(test_recovery())
