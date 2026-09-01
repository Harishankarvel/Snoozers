import React, { useRef, useEffect, useState } from 'react';
import { 
  Activity, 
  Eye, 
  Radio, 
  Compass, 
  MapPin, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Info, 
  ShieldCheck, 
  Sliders,
  Sparkles,
  Zap,
  Layers,
  Cpu,
  RefreshCw,
  Gauge
} from 'lucide-react';
import { 
  TelemetryPacket, 
  SensorEventMarker,
  FaultInjectionPayload
} from '../types/telemetry';

interface SensorMatrixTabProps {
  latestTelemetry: TelemetryPacket | null;
  onInjectFault?: (payload: FaultInjectionPayload) => void;
  activeFaults?: string[];
}

const SENSOR_SPECS: Record<string, { label: string; type: string; color: string; freq: string; powerNominal: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  camera: { 
    label: 'CAM (Forward RGB)', 
    type: 'Sony IMX490 8MP HDR', 
    color: '#00F0FF', 
    freq: '60 Hz', 
    powerNominal: '4.2 W', 
    icon: Eye 
  },
  lidar: { 
    label: 'LIDAR (Solid-State)', 
    type: '128-Beam 1550nm Solid-State', 
    color: '#A855F7', 
    freq: '20 Hz', 
    powerNominal: '18.5 W', 
    icon: Activity 
  },
  radar: { 
    label: 'RADAR (77 GHz FMCW)', 
    type: 'Continental ARS540 4D Imaging', 
    color: '#10B981', 
    freq: '25 Hz', 
    powerNominal: '8.0 W', 
    icon: Radio 
  },
  imu: { 
    label: 'IMU (Tactical Grade)', 
    type: '6-DoF MEMS Inertial Unit', 
    color: '#F59E0B', 
    freq: '200 Hz', 
    powerNominal: '0.8 W', 
    icon: Compass 
  },
  gnss: { 
    label: 'GNSS (RTK Dual-Band)', 
    type: 'Triple-Band Multi-Constellation RTK', 
    color: '#3B82F6', 
    freq: '20 Hz', 
    powerNominal: '1.5 W', 
    icon: MapPin 
  },
};

export const SensorMatrixTab: React.FC<SensorMatrixTabProps> = ({
  latestTelemetry,
  onInjectFault,
  activeFaults = []
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<SensorEventMarker | null>(null);
  const [visibleSensors, setVisibleSensors] = useState<Record<string, boolean>>({
    camera: true,
    lidar: true,
    radar: true,
    imu: true,
    gnss: true,
  });

  const confidenceData = latestTelemetry?.sensorConfidence;
  const current = confidenceData?.current;
  const history = confidenceData?.history || [];
  const events = confidenceData?.events || [];
  const arbitration = confidenceData?.arbitration;
  const orchestration = latestTelemetry?.metrics?.sensorOrchestration;

  const toggleSensor = (key: string) => {
    setVisibleSensors((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Render 15-Second Historical Confidence Graph on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#050A14';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 22, right: 35, bottom: 25, left: 45 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Draw Grid Lines (Y-Axis: 0%, 25%, 50%, 75%, 100%)
    ctx.strokeStyle = '#121E31';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748B';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';

    [0, 25, 50, 75, 100].forEach((pct) => {
      const y = padding.top + graphHeight - (pct / 100) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${pct}%`, padding.left - 6, y + 3);
    });

    // Draw Time Grid Lines (X-Axis: -15s, -10s, -5s, Live)
    ctx.textAlign = 'center';
    [15, 10, 5, 0].forEach((sec) => {
      const x = padding.left + ((15 - sec) / 15) * graphWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
      ctx.fillText(sec === 0 ? 'LIVE' : `-${sec}s`, x, height - padding.bottom + 16);
    });

    if (history.length < 2) {
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText('COLLECTING TEMPORAL TELEMETRY & CONFIDENCE...', width / 2, height / 2);
      return;
    }

    const latestTs = history[history.length - 1].timestamp;
    const windowDurationMs = 15000;
    const startTs = latestTs - windowDurationMs;

    // Helper: Map data point to canvas (X, Y)
    const getCoords = (timestamp: number, value: number) => {
      const xRatio = Math.max(0, Math.min(1, (timestamp - startTs) / windowDurationMs));
      const x = padding.left + xRatio * graphWidth;
      const y = padding.top + graphHeight - Math.max(0, Math.min(1, value)) * graphHeight;
      return { x, y };
    };

    // Draw Event Markers on Graph
    events.forEach((evt) => {
      if (evt.timestamp >= startTs && evt.timestamp <= latestTs) {
        const { x } = getCoords(evt.timestamp, 0.5);
        
        ctx.save();
        ctx.strokeStyle = evt.severity === 'WARNING' ? 'rgba(244, 63, 94, 0.7)' : 'rgba(250, 204, 21, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = evt.severity === 'WARNING' ? '#F43F5E' : '#FACC15';
        ctx.beginPath();
        ctx.arc(x, padding.top + 8, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // Draw Line Series for each Sensor
    Object.keys(SENSOR_SPECS).forEach((sensorKey) => {
      if (!visibleSensors[sensorKey]) return;

      const color = SENSOR_SPECS[sensorKey].color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();

      let isFirst = true;
      history.forEach((pt) => {
        if (pt.timestamp < startTs) return;
        const val = (pt as any)[sensorKey] ?? 0.95;
        const { x, y } = getCoords(pt.timestamp, val);

        if (isFirst) {
          ctx.moveTo(x, y);
          isFirst = false;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Current live pulse dot
      const lastPoint = history[history.length - 1];
      const lastVal = (lastPoint as any)[sensorKey] ?? 0.95;
      const { x: curX, y: curY } = getCoords(lastPoint.timestamp, lastVal);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(curX, curY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

  }, [history, events, visibleSensors]);

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'RISING':
        return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
      case 'FALLING':
        return <TrendingDown className="w-3.5 h-3.5 text-rose-400 animate-pulse" />;
      default:
        return <Minus className="w-3.5 h-3.5 text-cyan-400" />;
    }
  };

  const getGatingBadge = (sensorKey: string, health?: string) => {
    const matrixState = orchestration?.matrix ? (orchestration.matrix as any)[sensorKey] : undefined;
    const state = matrixState || (health === 'FAULT' ? 'FAULT' : health === 'DEGRADED' ? 'DEGRADED' : 'ACTIVE');

    switch (state) {
      case 'BOOSTED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.3)] animate-pulse">
            <Zap className="w-3 h-3 text-purple-400" /> BOOSTED (HIGH RES)
          </span>
        );
      case 'STANDBY':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
            <RefreshCw className="w-3 h-3 text-slate-400" /> STANDBY (ECO)
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 animate-pulse">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> DEGRADED
          </span>
        );
      case 'FAULT':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40 animate-bounce">
            <XCircle className="w-3 h-3 text-rose-400" /> HARD FAULT
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> ACTIVE (ONLINE)
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      {/* 1. Header Overview & Gating Rationale Banner */}
      <section className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-3 shadow-xl">
        <div className="flex flex-wrap items-center justify-between border-b border-[#1A2638] pb-3 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <Layers className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <span>DYNAMIC SENSOR ORCHESTRATION &amp; CONFIDENCE MATRIX</span>
                <span className="text-[11px] px-2 py-0.5 bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 rounded font-normal">
                  PAGE 3 // SENSOR MATRIX &amp; GATING
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Temporal EMA fidelity tracking (0% to 100%), fault isolation, dynamic gating, and confidence-weighted arbitration.
              </p>
            </div>
          </div>

          {/* Efficiency & Arbitration Badge */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 rounded-lg bg-[#0B1322] border border-[#1E2E48] text-xs font-mono flex items-center gap-2">
              <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">GATING EFFICIENCY:</span>
              <span className="text-emerald-400 font-bold">99.8% OPTIMAL</span>
            </div>

            {arbitration?.is_degraded_arbitration ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-mono font-bold shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>RADAR ARBITRATION OVERRIDE ACTIVE</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-xs font-mono">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>MULTI-SENSOR CONSENSUS (NOMINAL)</span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Sensor Allocation Rationale Callout */}
        <div className="p-3 rounded-lg bg-[#050A14] border border-[#141F32] flex items-start justify-between gap-3 text-xs font-mono">
          <div className="flex items-start gap-2">
            <Cpu className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-slate-400">DYNAMIC SENSOR GATING RATIONALE: </span>
              <span className="text-cyan-300 font-bold">
                {orchestration?.rationale || 'Nominal multi-sensor optical/RF consensus active across all 5 modalities.'}
              </span>
            </div>
          </div>
          {arbitration && (
            <div className="text-purple-300 text-[11px] hidden sm:block flex-shrink-0">
              <span className="text-slate-400">Arbitration Chain: </span>
              {arbitration.override_reason}
            </div>
          )}
        </div>
      </section>

      {/* 2. Five Sensor Modality State Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(SENSOR_SPECS).map(([key, spec]) => {
          const item = current ? (current as any)[key] : null;
          const Icon = spec.icon;
          const confPct = item?.confidencePct ?? (item?.confidence ? item.confidence * 100 : 95);
          const isLow = confPct < 60;
          const isCrit = confPct < 30;

          return (
            <div
              key={key}
              className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                isCrit
                  ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                  : isLow
                  ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                  : 'bg-[#080D17]/90 border-[#1A2638] hover:border-[#22334D]'
              }`}
            >
              {/* Card Header: Sensor Icon, Name, and Gating State */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#050A14] border border-[#1A2638]">
                    <Icon className="w-4 h-4" style={{ color: spec.color }} />
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold text-slate-100">{key.toUpperCase()}</div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">{spec.type}</div>
                  </div>
                </div>
              </div>

              {/* Gating Status Badge */}
              <div className="flex justify-start">
                {getGatingBadge(key, item?.health)}
              </div>

              {/* Confidence Numerical Metric & Trend */}
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <div className="text-[10px] font-mono text-slate-400">FIDELITY SCORE</div>
                  <div
                    className={`text-3xl font-mono font-bold tracking-tight ${
                      isCrit ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-slate-100'
                    }`}
                  >
                    {confPct.toFixed(1)}%
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-mono text-slate-400">TREND</div>
                  <div className="flex items-center gap-1 text-xs font-mono font-bold text-slate-300">
                    {getTrendIcon(item?.trend)}
                    <span>{item?.trend || 'STABLE'}</span>
                  </div>
                </div>
              </div>

              {/* Progress Gauge Bar */}
              <div className="w-full h-2 bg-[#050A14] rounded-full overflow-hidden border border-[#141F32]">
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, confPct))}%`,
                    backgroundColor: isCrit ? '#F43F5E' : isLow ? '#F59E0B' : spec.color,
                  }}
                />
              </div>

              {/* Hardware Specs & Environmental Reason */}
              <div className="pt-2 border-t border-[#141F32] flex flex-col gap-1 text-[10px] font-mono text-slate-400">
                <div className="flex justify-between">
                  <span className="text-slate-500">POLL RATE:</span>
                  <span className="text-slate-300 font-bold">{spec.freq}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">POWER DRAW:</span>
                  <span className="text-slate-300">{spec.powerNominal}</span>
                </div>
                <div className="flex justify-between items-center pt-0.5 truncate">
                  <span className="text-slate-500">STATE:</span>
                  <span
                    className={`font-bold truncate ${
                      isCrit ? 'text-rose-300' : isLow ? 'text-amber-300' : 'text-cyan-300'
                    }`}
                  >
                    [{item?.reason || 'NOMINAL_CLEAR'}]
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* 3. Interactive 15-Second Rolling Historical Graph */}
      <section className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-3 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A2638] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-200 font-bold">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>15-SECOND ROLLING TEMPORAL SENSOR CONFIDENCE GRAPH (EMA &alpha; = 0.20)</span>
          </div>

          {/* Sensor Legend Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(SENSOR_SPECS).map(([key, spec]) => (
              <button
                key={key}
                onClick={() => toggleSensor(key)}
                className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-all ${
                  visibleSensors[key]
                    ? 'bg-[#0B1424] border-[#1E304D] text-slate-100 shadow-sm'
                    : 'bg-[#05070B] border-[#0F172A] text-slate-600 line-through'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: visibleSensors[key] ? spec.color : '#475569',
                  }}
                />
                <span>{key.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Display */}
        <div className="w-full h-56 relative rounded-lg overflow-hidden border border-[#141F32]">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>

        {/* Clickable Event Markers List */}
        {events.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#141F32]">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>TEMPORAL EVENT MARKERS (CLICK TO INSPECT ROOT CAUSE):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 overflow-x-auto py-1">
              {events.slice(-8).map((evt) => {
                const isSelected = selectedEvent?.id === evt.id;
                return (
                  <button
                    key={evt.id}
                    onClick={() => setSelectedEvent(isSelected ? null : evt)}
                    className={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 border transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                        : evt.severity === 'WARNING'
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-900/50'
                        : 'bg-[#0B1424] border-[#1A2840] text-amber-300 hover:bg-[#121F36]'
                    }`}
                  >
                    <span className="text-slate-500">[{evt.timeLabel}]</span>
                    <span className="font-bold">{evt.event}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Event Details Modal / Callout */}
        {selectedEvent && (
          <div className="p-3 rounded-lg bg-[#0A1322] border border-cyan-500/40 text-xs font-mono text-slate-200 flex items-start justify-between gap-3 shadow-lg">
            <div className="space-y-1">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>EVENT MARKER: {selectedEvent.event}</span>
                <span className="text-slate-500">({selectedEvent.timeLabel})</span>
              </div>
              <div className="text-slate-300">
                <span className="text-slate-400">Causal Explanation: </span>
                {selectedEvent.reason}
              </div>
              {arbitration && (
                <div className="text-purple-300">
                  <span className="text-slate-400">Arbitration Response: </span>
                  {arbitration.override_reason}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold"
            >
              DISMISS
            </button>
          </div>
        )}
      </section>

      {/* 4. Fault Injection & Scenario Simulation Testing for Sensor Matrix */}
      {onInjectFault && (
        <section className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-3 shadow-xl">
          <div className="flex justify-between items-center border-b border-[#1A2638] pb-2 text-xs font-mono">
            <span className="text-cyan-400 font-bold uppercase">
              INTERACTIVE SENSOR FAULT INJECTION &amp; ARBITRATION TEST BENCH
            </span>
            <span className="text-slate-400 text-[11px]">TRIGGER ENVIRONMENTAL CONDITIONS LIVE</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
            <button
              onClick={() => onInjectFault({ action: 'inject_fault', faultType: 'weather_degradation', durationSec: 10 })}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1 transition-all ${
                activeFaults.includes('weather_degradation')
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
                  : 'bg-[#0A101D] border-[#1A2638] hover:border-cyan-500 text-slate-200 hover:bg-[#0E1626]'
              }`}
            >
              <span>🌫️ Severe Fog</span>
              <span className="text-[10px] text-slate-400 font-normal">CAM ↓38%, RADAR 98%</span>
            </button>

            <button
              onClick={() => onInjectFault({ action: 'inject_fault', faultType: 'camera_glare', durationSec: 8 })}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1 transition-all ${
                activeFaults.includes('camera_glare')
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
                  : 'bg-[#0A101D] border-[#1A2638] hover:border-cyan-500 text-slate-200 hover:bg-[#0E1626]'
              }`}
            >
              <span>☀️ Direct Sun Glare</span>
              <span className="text-[10px] text-slate-400 font-normal">CAM ↓28% Blinded</span>
            </button>

            <button
              onClick={() => onInjectFault({ action: 'inject_fault', faultType: 'sensor_blindspot', durationSec: 8 })}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1 transition-all ${
                activeFaults.includes('sensor_blindspot')
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse'
                  : 'bg-[#0A101D] border-[#1A2638] hover:border-cyan-500 text-slate-200 hover:bg-[#0E1626]'
              }`}
            >
              <span>🚫 Right Blindspot</span>
              <span className="text-[10px] text-slate-400 font-normal">CAM/LiDAR Occluded</span>
            </button>

            <button
              onClick={() => onInjectFault({ action: 'inject_fault', faultType: 'lidar_failure', durationSec: 8 })}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1 transition-all ${
                activeFaults.includes('lidar_failure')
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse'
                  : 'bg-[#0A101D] border-[#1A2638] hover:border-cyan-500 text-slate-200 hover:bg-[#0E1626]'
              }`}
            >
              <span>⚡ LiDAR Emitter Fail</span>
              <span className="text-[10px] text-slate-400 font-normal">HARD FAULT (5%)</span>
            </button>

            <button
              onClick={() => onInjectFault({ action: 'inject_fault', faultType: 'gnss_dropout', durationSec: 8 })}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1 transition-all ${
                activeFaults.includes('gnss_dropout')
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
                  : 'bg-[#0A101D] border-[#1A2638] hover:border-cyan-500 text-slate-200 hover:bg-[#0E1626]'
              }`}
            >
              <span>📡 GNSS Multipath</span>
              <span className="text-[10px] text-slate-400 font-normal">RTK Lock Lost</span>
            </button>

            <button
              onClick={() => onInjectFault({ action: 'clear_faults' })}
              className="p-3 rounded-lg bg-[#0A101D] border border-[#1A2638] hover:border-emerald-500 text-emerald-400 hover:bg-[#0E1626] font-bold flex flex-col items-center gap-1"
            >
              <span>🔄 Clear / Recover</span>
              <span className="text-[10px] text-slate-400 font-normal">EMA Recovery to 100%</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
