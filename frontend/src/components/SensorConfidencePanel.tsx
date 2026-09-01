import React, { useRef, useEffect, useState } from 'react';
import { 
  Activity, 
  Eye, 
  Radio, 
  Wifi, 
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
  Sparkles
} from 'lucide-react';
import { 
  SensorConfidenceData, 
  SensorEventMarker 
} from '../types/telemetry';

interface SensorConfidencePanelProps {
  confidenceData?: SensorConfidenceData;
}

const SENSOR_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  camera: { label: 'CAM (Forward RGB)', color: '#00F0FF', icon: Eye },
  lidar: { label: 'LIDAR (Solid-State)', color: '#A855F7', icon: Activity },
  radar: { label: 'RADAR (77 GHz FMCW)', color: '#10B981', icon: Radio },
  imu: { label: 'IMU (6-DoF)', color: '#F59E0B', icon: Compass },
  gnss: { label: 'GNSS (RTK Dual-Band)', color: '#3B82F6', icon: MapPin },
};

export const SensorConfidencePanel: React.FC<SensorConfidencePanelProps> = ({ confidenceData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<SensorEventMarker | null>(null);
  const [visibleSensors, setVisibleSensors] = useState<Record<string, boolean>>({
    camera: true,
    lidar: true,
    radar: true,
    imu: true,
    gnss: true,
  });

  const current = confidenceData?.current;
  const history = confidenceData?.history || [];
  const events = confidenceData?.events || [];
  const arbitration = confidenceData?.arbitration;

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

    const padding = { top: 20, right: 30, bottom: 25, left: 42 };
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
      ctx.fillText('COLLECTING TEMPORAL TELEMETRY...', width / 2, height / 2);
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
        
        // Vertical dashed marker line
        ctx.save();
        ctx.strokeStyle = evt.severity === 'WARNING' ? 'rgba(244, 63, 94, 0.7)' : 'rgba(250, 204, 21, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();

        // Marker badge icon / circle
        ctx.setLineDash([]);
        ctx.fillStyle = evt.severity === 'WARNING' ? '#F43F5E' : '#FACC15';
        ctx.beginPath();
        ctx.arc(x, padding.top + 8, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // Draw Line Series for each Sensor
    Object.keys(SENSOR_CONFIG).forEach((sensorKey) => {
      if (!visibleSensors[sensorKey]) return;

      const color = SENSOR_CONFIG[sensorKey].color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
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
      ctx.arc(curX, curY, 4, 0, Math.PI * 2);
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

  const getHealthBadge = (health?: string) => {
    switch (health) {
      case 'ONLINE':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> ONLINE
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> DEGRADED
          </span>
        );
      case 'FAULT':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 animate-bounce">
            <XCircle className="w-3 h-3" /> FAULT
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
            STALE
          </span>
        );
    }
  };

  return (
    <section className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-3 shadow-lg">
      {/* 1. Header & Arbitration Status */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#1A2638] pb-2.5 gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            SENSOR CONFIDENCE EVOLUTION &amp; ARBITRATION MATRIX
          </h2>
        </div>

        {/* Dynamic Arbitration Status Badge */}
        <div className="flex items-center gap-2">
          {arbitration?.is_degraded_arbitration ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-mono font-bold shadow-[0_0_12px_rgba(168,85,247,0.3)] animate-pulse">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>RADAR ARBITRATION OVERRIDE ACTIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>FULL MULTI-SENSOR CONSENSUS (NOMINAL)</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Sensor Current State Cards Grid (5 Modalities) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {Object.entries(SENSOR_CONFIG).map(([key, config]) => {
          const item = current ? (current as any)[key] : null;
          const Icon = config.icon;
          const confPct = item?.confidencePct ?? (item?.confidence ? item.confidence * 100 : 95);
          const isLow = confPct < 60;
          const isCrit = confPct < 30;

          return (
            <div
              key={key}
              className={`p-3 rounded-lg border transition-all flex flex-col justify-between gap-2 ${
                isCrit
                  ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                  : isLow
                  ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'bg-[#050A14] border-[#141E2F] hover:border-[#1E304B]'
              }`}
            >
              {/* Top Card Bar: Name & Health */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {key.toUpperCase()}
                  </span>
                </div>
                {getHealthBadge(item?.health)}
              </div>

              {/* Confidence Value & Trend */}
              <div className="flex items-baseline justify-between pt-1">
                <div className="flex items-baseline gap-1">
                  <span
                    className={`text-2xl font-mono font-bold tracking-tight ${
                      isCrit ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-slate-100'
                    }`}
                  >
                    {confPct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">FIDELITY</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                  {getTrendIcon(item?.trend)}
                  <span>{item?.trend || 'STABLE'}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-[#0F172A] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, confPct))}%`,
                    backgroundColor: isCrit ? '#F43F5E' : isLow ? '#F59E0B' : config.color,
                  }}
                />
              </div>

              {/* Reason / Condition Tag */}
              <div className="text-[10px] font-mono text-slate-400 truncate flex items-center gap-1">
                <span className="text-slate-500">STATE:</span>
                <span
                  className={`font-semibold ${
                    isCrit ? 'text-rose-300' : isLow ? 'text-amber-300' : 'text-cyan-300'
                  }`}
                >
                  [{item?.reason || 'NOMINAL_CLEAR'}]
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Interactive 15-Second Historical Graph */}
      <div className="bg-[#050A14] rounded-lg border border-[#141E2F] p-3 flex flex-col gap-2 relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 font-bold">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>15-SECOND ROLLING TEMPORAL CONFIDENCE GRAPH (EMA SMOOTHED)</span>
          </div>

          {/* Sensor Legend Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(SENSOR_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => toggleSensor(key)}
                className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded border transition-all ${
                  visibleSensors[key]
                    ? 'bg-[#08101E] border-[#1E2D45] text-slate-200'
                    : 'bg-[#05070B] border-[#0F172A] text-slate-600 line-through'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: visibleSensors[key] ? config.color : '#475569',
                  }}
                />
                <span>{key.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Display */}
        <div className="w-full h-44 relative rounded overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>

        {/* 4. Clickable Event Markers List */}
        {events.length > 0 && (
          <div className="flex flex-col gap-1 pt-1 border-t border-[#121E31]">
            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
              <Info className="w-3 h-3 text-cyan-400" />
              <span>TEMPORAL EVENT MARKERS (CLICK TO INSPECT):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 overflow-x-auto py-1">
              {events.slice(-8).map((evt) => {
                const isSelected = selectedEvent?.id === evt.id;
                return (
                  <button
                    key={evt.id}
                    onClick={() => setSelectedEvent(isSelected ? null : evt)}
                    className={`px-2 py-1 rounded text-[10px] font-mono flex items-center gap-1.5 border transition-all ${
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
          <div className="p-2.5 rounded bg-[#0A1322] border border-cyan-500/40 text-xs font-mono text-slate-200 flex items-start justify-between gap-2 shadow-lg">
            <div className="space-y-1">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>EVENT: {selectedEvent.event}</span>
                <span className="text-slate-500">at {selectedEvent.timeLabel}</span>
              </div>
              <div className="text-[11px] text-slate-300">
                <span className="text-slate-400">Causal Chain: </span>
                {selectedEvent.reason}
              </div>
              {arbitration && (
                <div className="text-[11px] text-purple-300">
                  <span className="text-slate-400">Arbitration Response: </span>
                  {arbitration.override_reason}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
            >
              DISMISS
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
