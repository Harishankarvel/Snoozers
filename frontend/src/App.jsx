import React, { useState, useEffect, useRef } from 'react';
import { AlertBanner } from './components/AlertBanner';
import { HUDView } from './components/HUDView';
import { ControlsGauge } from './components/ControlsGauge';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ConnectionModal } from './components/ConnectionModal';
import { 
  Activity, 
  Cpu, 
  Radio, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  RefreshCw, 
  Wifi, 
  WifiOff 
} from 'lucide-react';

export const App = () => {
  // Configurable WebSocket URLs (default port 8080 per backend spec, with 8000 fallback)
  const [wsPort, setWsPort] = useState('8080');
  const [isSimulated, setIsSimulated] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [fps, setFps] = useState(0);

  // Incoming Telemetry State
  const [telemetry, setTelemetry] = useState({
    timestamp_ms: 0,
    ego_telemetry: {
      kinematics: { speed_kmh: 65.0, steering_angle: 0.0 },
      control_signals: { throttle_pct: 45, brake_pressure: 0, gear: 'D', drive_mode: 'Autonomous' },
      safety_metrics: { collision_risk_score: 0.12, alert_status: 'SAFE' }
    },
    objects: [
      { class: 'Car', bbox_2d: [520, 310, 640, 390], confidence: 0.92 },
      { class: 'Truck', bbox_2d: [760, 260, 890, 380], confidence: 0.88 }
    ]
  });

  const wsRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsCalcRef = useRef(Date.now());
  const simIntervalRef = useRef(null);

  // 1. WebSocket Live Stream Connection
  const connectWebSocket = () => {
    if (isSimulated) return;
    setIsConnecting(true);

    try {
      const wsUrl = `ws://localhost:${wsPort}/ws/telemetry`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        console.log(`Connected to AV Telemetry at ${wsUrl}`);
      };

      ws.onmessage = (event) => {
        frameCountRef.current++;
        try {
          const data = JSON.parse(event.data);
          if (data.ego_telemetry) {
            setTelemetry(data);
          }
        } catch (e) {
          // non-json or ping
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
      };

      ws.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
      };

      wsRef.current = ws;
    } catch (e) {
      setIsConnected(false);
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (!isSimulated) {
      connectWebSocket();
    } else {
      if (wsRef.current) wsRef.current.close();
      setIsConnected(true);
      setIsConnecting(false);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [wsPort, isSimulated]);

  // FPS Calculator Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFpsCalcRef.current) / 1000;
      if (elapsed >= 1.0) {
        setFps(Math.round(frameCountRef.current / elapsed));
        frameCountRef.current = 0;
        lastFpsCalcRef.current = now;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Built-in Simulation Generator (when backend is offline)
  useEffect(() => {
    if (!isSimulated) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    let frame = 0;
    simIntervalRef.current = setInterval(() => {
      frame++;
      frameCountRef.current++;

      // Simulate cyclical collision risk
      const phase = (frame % 300) / 300;
      let simRisk = 0.08 + Math.sin(phase * Math.PI * 2) * 0.45;
      if (frame % 300 > 180 && frame % 300 < 240) {
        simRisk = 0.78; // Trigger critical collision period
      }
      simRisk = Math.max(0.02, Math.min(0.98, simRisk));

      const isCrit = simRisk > 0.6;
      const speed = isCrit ? Math.max(0, 65 - (frame % 300 - 180) * 2) : 65.0;
      const brake = isCrit ? 85 : 0;
      const throttle = isCrit ? 0 : 45;

      const simObjects = [
        {
          class: 'Car',
          bbox_2d: [
            Math.round(520 + Math.sin(frame * 0.05) * 40),
            Math.round(isCrit ? 260 : 310),
            Math.round(660 + Math.sin(frame * 0.05) * 40),
            Math.round(isCrit ? 430 : 390)
          ],
          confidence: 0.94
        },
        {
          class: isCrit ? 'Pedestrian' : 'Truck',
          bbox_2d: [
            Math.round(isCrit ? 400 + Math.sin(frame * 0.08) * 60 : 780),
            Math.round(isCrit ? 300 : 250),
            Math.round(isCrit ? 450 + Math.sin(frame * 0.08) * 60 : 910),
            Math.round(isCrit ? 410 : 370)
          ],
          confidence: 0.89
        }
      ];

      setTelemetry({
        timestamp_ms: frame * 33,
        ego_telemetry: {
          kinematics: {
            speed_kmh: speed,
            steering_angle: Math.sin(frame * 0.04) * 1.5
          },
          control_signals: {
            throttle_pct: throttle,
            brake_pressure: brake,
            gear: 'D',
            drive_mode: 'Autonomous'
          },
          safety_metrics: {
            collision_risk_score: simRisk,
            alert_status: isCrit ? 'CRITICAL: IMMINENT COLLISION' : simRisk >= 0.4 ? 'CAUTION' : 'SAFE'
          }
        },
        objects: simObjects
      });
    }, 33); // ~30 FPS

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [isSimulated]);

  const ego = telemetry.ego_telemetry;
  const riskScore = ego.safety_metrics?.collision_risk_score ?? 0;

  return (
    <div className="min-h-screen bg-[#05070B] text-slate-100 flex flex-col font-sans select-none">
      {/* Top HUD Header */}
      <header className="bg-[#080D17]/90 backdrop-blur-md border-b border-[#1A2638] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold font-mono shadow-[0_0_15px_rgba(0,240,255,0.25)]">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold font-mono tracking-wider text-slate-100 flex items-center gap-2">
              <span>AURA-AV</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 rounded">
                PERCEPTION HUD v3.0
              </span>
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              YOLOv8 PERCEPTION + CNN-LSTM COLLISION PREDICTION SYSTEM
            </p>
          </div>
        </div>

        {/* WebSocket Stream Monitor Badge & Port Selector */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-[#0B1220] px-3 py-1.5 rounded-lg border border-[#1E2D45] text-xs font-mono">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="text-slate-400">ws://localhost:{wsPort}/ws/telemetry</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              isConnected
                ? isSimulated
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}>
              {isConnected ? (isSimulated ? 'SIMULATOR' : 'LIVE 30 FPS') : 'OFFLINE'}
            </span>
          </div>

          {/* Port Switcher (8080 vs 8000) */}
          <button
            onClick={() => setWsPort(wsPort === '8080' ? '8000' : '8080')}
            className="px-2.5 py-1.5 rounded text-xs font-mono bg-[#0F172A] border border-slate-700 text-slate-300 hover:border-cyan-500 transition-colors"
            title="Switch WebSocket Port (8080 / 8000)"
          >
            PORT: {wsPort}
          </button>

          {/* Simulator Mode Toggle */}
          <button
            onClick={() => setIsSimulated(!isSimulated)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border ${
              isSimulated
                ? 'bg-purple-600/30 text-purple-200 border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                : 'bg-[#0F172A] text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isSimulated ? 'SIMULATOR ON' : 'CONNECT BACKEND'}</span>
          </button>
        </div>
      </header>

      {/* Main Mission Control Grid */}
      <main className="flex-1 p-3 sm:p-4 max-w-[1920px] w-full mx-auto flex flex-col gap-3 sm:gap-4">
        {/* 1. Dynamic Decision Support & Collision Alert Banner */}
        <AlertBanner safetyMetrics={ego.safety_metrics} />

        {/* 2. Main Viewport & Telemetry Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch">
          {/* Central Dashcam HUD Viewport (8 Columns) */}
          <div className="lg:col-span-8 flex flex-col">
            <HUDView
              objects={telemetry.objects}
              collisionRiskScore={riskScore}
              isSimulated={isSimulated}
            />
          </div>

          {/* Right Column: Detected Obstacles Log (4 Columns) */}
          <div className="lg:col-span-4 flex flex-col">
            <TelemetryPanel
              objects={telemetry.objects}
              collisionRiskScore={riskScore}
              timestampMs={telemetry.timestamp_ms}
            />
          </div>
        </div>

        {/* 3. Bottom Controls & Kinematics Gauge */}
        <div className="w-full">
          <ControlsGauge
            kinematics={ego.kinematics}
            controlSignals={ego.control_signals}
          />
        </div>
      </main>

      {/* Disconnect / Reconnect Overlay Modal */}
      <ConnectionModal
        isConnected={isConnected}
        isConnecting={isConnecting}
        wsUrl={`ws://localhost:${wsPort}/ws/telemetry`}
        onReconnect={connectWebSocket}
        onToggleSim={() => setIsSimulated(true)}
      />
    </div>
  );
};

export default App;
