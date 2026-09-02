import asyncio
import json
import websockets

async def test_hard_brake():
    async with websockets.connect('ws://127.0.0.1:8000/ws/telemetry') as ws:
        await ws.send(json.dumps({'action': 'clear_faults'}))
        await asyncio.sleep(0.3)
        
        print('\n--> INJECTING FAULT: sudden_brake (Handbrake applied on ego car)...')
        await ws.send(json.dumps({'action': 'inject_fault', 'faultType': 'sudden_brake', 'durationSec': 6}))
        
        for i in range(8):
            raw = await ws.recv()
            pkt = json.loads(raw)
            if 'decision' in pkt:
                speed = pkt['metrics']['speedKmh']
                brake = pkt['metrics']['brakePressurePct']
                action = pkt['decision']['action']
                objs = pkt.get('objects', [])
                lead_obj = [o for o in objs if o.get('id') == 101]
                lead_dist = lead_obj[0]['distance'] if lead_obj else 0
                print(f"[Frame {pkt.get('frameId'):>2}] Ego Speed: {speed:>4.1f} km/h | Brake: {brake:>3}% | Action: {action} | Lead Car Gap: {lead_dist}m")

if __name__ == '__main__':
    asyncio.run(test_hard_brake())
