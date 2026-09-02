import asyncio
import json
import websockets

async def test_stability():
    async with websockets.connect('ws://127.0.0.1:8000/ws/telemetry') as ws:
        await ws.send(json.dumps({'action': 'clear_faults'}))
        await asyncio.sleep(0.3)
        print('=== 1. NORMAL CRUISE STATE ===')
        for i in range(5):
            pkt = json.loads(await ws.recv())
            if 'metrics' in pkt:
                m = pkt['metrics']
                print(f"Speed: {m['speedKmh']:>4.1f} km/h | Brake: {m['brakePressurePct']:>3}% | Throttle: {m['throttlePct']:>3}% | LeadDist: {m['distanceToLeadVehicle']:>4.1f}m | Action: {pkt['decision']['action']}")
        
        print('\n=== 2. APPLYING HAND BRAKE ===')
        await ws.send(json.dumps({'action': 'inject_fault', 'faultType': 'sudden_brake', 'durationSec': 4}))
        for i in range(8):
            pkt = json.loads(await ws.recv())
            if 'metrics' in pkt:
                m = pkt['metrics']
                print(f"Speed: {m['speedKmh']:>4.1f} km/h | Brake: {m['brakePressurePct']:>3}% | Throttle: {m['throttlePct']:>3}% | LeadDist: {m['distanceToLeadVehicle']:>4.1f}m | Action: {pkt['decision']['action']}")

if __name__ == '__main__':
    asyncio.run(test_stability())
