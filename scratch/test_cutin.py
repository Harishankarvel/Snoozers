import asyncio
import json
import websockets

async def test_cutin():
    async with websockets.connect('ws://127.0.0.1:8000/ws/telemetry') as ws:
        await ws.send(json.dumps({'action': 'clear_faults'}))
        await asyncio.sleep(0.3)
        
        print('\n=== INJECTING CUT-IN VEHICLE FAULT ===')
        await ws.send(json.dumps({'action': 'inject_fault', 'faultType': 'cut_in_vehicle', 'durationSec': 6}))
        
        for i in range(10):
            raw = await ws.recv()
            pkt = json.loads(raw)
            if 'metrics' in pkt and 'decision' in pkt:
                m = pkt['metrics']
                dec = pkt['decision']
                ttc = pkt.get('ttcAlert', {})
                objs = pkt.get('objects', [])
                cutin_obj = [o for o in objs if o.get('id') == 103]
                cut_info = f"CutIn #{cutin_obj[0]['id']}: x={cutin_obj[0]['position3D']['x']}m, z={cutin_obj[0]['distance']}m, ttc={cutin_obj[0]['ttc']}s" if cutin_obj else "No CutIn obj"
                print(f"[Frame {pkt.get('frameId'):>2}] Speed: {m['speedKmh']:>4.1f} km/h | Brake: {m['brakePressurePct']:>3}% | Action: {dec['action']} | {cut_info} | TTC Alert: {ttc.get('level')}")

if __name__ == '__main__':
    asyncio.run(test_cutin())
