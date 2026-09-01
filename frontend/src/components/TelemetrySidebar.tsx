import React from 'react';
import { 
  Gauge, 
  ShieldAlert, 
  Compass, 
  Activity, 
  Zap,
  Radio,
  AlertTriangle
} from 'lucide-react';
import { TelemetryPacket } from '../types/telemetry';

interface TelemetrySidebarProps {
  telemetry: TelemetryPacket | null;
  onEndJourney?: () => void;
  onResetTrip?: () => void;
}

export const TelemetrySidebar: React.FC<TelemetrySidebarProps> = ({ 
  telemetry, 
  onEndJourney, 
  onResetTrip 
}) => {
  const metrics = telemetry?.metrics;
  const ttcAlert = telemetry?.ttcAlert;

  const hazardsTackled = metrics?.hazardEventsTackled ?? 0;
  const pathDev = metrics?.pathDeviation;
  const sensorOrchestration = metrics?.sensorOrchestration;

  const isCriticalTtc = ttcAlert?.level === 'CRITICAL';
  const isCautionTtc = ttcAlert?.level === 'CAUTION';

  const speedKmh = metrics?.speedKmh ?? 0;
  const speedMph = metrics?.speedMph ?? 0;
  const targetSpeed = metrics?.targetSpeedKmh ?? 70;
  const steeringAngle = metrics?.steeringAngleDeg ?? 0;
  const brakePressure = metrics?.brakePressurePct ?? 0;
  const throttle = metrics?.throttlePct ?? 0;
  const accelG = metrics?.accelerationG ?? 0;
  const latG = metrics?.lateralG ?? 0;
  const totalDistKm = ((metrics?.totalDistanceTravelledMeters ?? 0) / 1000).toFixed(2);

  // Speedometer Arc calculation (0 to 140 km/h)
  const maxSpeed = 140;
  const speedRatio = Math.min(1, Math.max(0, speedKmh / maxSpeed));
  const arcStrokeDash = 220;
  const arcOffset = arcStrokeDash - (arcStrokeDash * speedRatio);

  const getSensorStatusBadge = (status?: string) => {
    const s = (status || 'ACTIVE').toUpperCase();
    if (s.includes('BOOSTED')) {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse">BOOSTED</span>;
    }
    if (s.includes('DEGRADED')) {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">DEGRADED</span>;
    }
    if (s.includes('FAULT')) {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">FAULT</span>;
    }
    if (s.includes('STANDBY')) {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400">STANDBY</span>;
    }
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">ACTIVE</span>;
  };


  return (
    <aside className="w-full lg:w-80 flex flex-col gap-3">
      {/* 1. Primary Speed & Dynamics HUD Card */}
      <div className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-3 shadow-lg relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#1A2638] pb-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
              VEHICLE TELEMETRY
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
            metrics?.driveMode === 'EMERGENCY_STOP'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
              : metrics?.driveMode === 'MANUAL_OVERRIDE'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
          }`}>
            {metrics?.driveMode || 'AUTONOMOUS'}
          </span>
        </div>

        {/* Speedometer Radial Gauge */}
        <div className="relative flex flex-col items-center justify-center py-2">
          <svg className="w-44 h-28 transform -rotate-90" viewBox="0 0 100 60">
            {/* Background Arc Track */}
            <path
              d="M 15 50 A 35 35 0 0 1 85 50"
              fill="none"
              stroke="#131F33"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {/* Value Arc Glow */}
            <path
              d="M 15 50 A 35 35 0 0 1 85 50"
              fill="none"
              stroke={isCriticalTtc ? '#FF2A6D' : '#00F0FF'}
              strokeWidth="7"
              strokeDasharray={arcStrokeDash}
              strokeDashoffset={arcOffset}
              strokeLinecap="round"
              className="transition-all duration-150 ease-out"
            />
          </svg>

          {/* Speed Digital Readout */}
          <div className="absolute top-8 flex flex-col items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold font-mono text-slate-100 tracking-tight">
                {speedKmh.toFixed(0)}
              </span>
              <span className="text-xs font-mono font-semibold text-cyan-400">KM/H</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {speedMph.toFixed(0)} MPH <span className="text-slate-600">|</span> SET {targetSpeed}
            </span>
          </div>

          {/* Throttle and Brake Power Bars */}
          <div className="w-full grid grid-cols-2 gap-3 mt-1 pt-2 border-t border-[#131F33]">
            {/* Throttle */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>THROTTLE</span>
                <span className="text-cyan-300 font-bold">{throttle}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#131F33] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-cyan-400 transition-all duration-150"
                  style={{ width: `${throttle}%` }}
                />
              </div>
            </div>

            {/* Brake */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>BRAKE</span>
                <span className="text-rose-400 font-bold">{brakePressure}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#131F33] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-500 transition-all duration-150"
                  style={{ width: `${brakePressure}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Steering & G-Force Vectors */}
        <div className="grid grid-cols-2 gap-2 bg-[#050A14] p-2.5 rounded-lg border border-[#141E2F] text-xs font-mono">
          <div>
            <div className="text-[10px] text-slate-500 uppercase">STEERING ANGLE</div>
            <div className="text-sm font-bold text-slate-200 mt-0.5 flex items-center gap-1.5">
              <Compass 
                className="w-4 h-4 text-cyan-400 transition-transform duration-100" 
                style={{ transform: `rotate(${steeringAngle * 2}deg)` }}
              />
              <span>{steeringAngle > 0 ? `+${steeringAngle.toFixed(1)}°` : `${steeringAngle.toFixed(1)}°`}</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-500 uppercase">ACCELERATION</div>
            <div className="text-sm font-bold text-slate-200 mt-0.5 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>{accelG > 0 ? `+${accelG.toFixed(2)}G` : `${accelG.toFixed(2)}G`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Critical Time-To-Collision (TTC) & Threat Radar Alert */}
      <div className={`backdrop-blur-md rounded-xl border p-4 flex flex-col gap-2.5 transition-all shadow-lg ${
        isCriticalTtc
          ? 'bg-rose-950/40 border-rose-500 shadow-[0_0_20px_rgba(255,42,109,0.3)] animate-pulse'
          : isCautionTtc
          ? 'bg-amber-950/30 border-amber-500/60 shadow-[0_0_15px_rgba(255,184,0,0.2)]'
          : 'bg-[#080D17]/90 border-[#1A2638]'
      }`}>
        <div className="flex items-center justify-between border-b border-[#1A2638] pb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`w-4 h-4 ${
              isCriticalTtc ? 'text-rose-400' : isCautionTtc ? 'text-amber-400' : 'text-emerald-400'
            }`} />
            <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
              TTC COLLISION RADAR
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
            isCriticalTtc
              ? 'bg-rose-500 text-white animate-bounce'
              : isCautionTtc
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          }`}>
            {ttcAlert?.level || 'SAFE'}
          </span>
        </div>

        {/* TTC Gauge Value */}
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-[10px] font-mono text-slate-400">TIME TO COLLISION</div>
            <div className={`text-2xl font-bold font-mono ${
              isCriticalTtc ? 'text-rose-400' : isCautionTtc ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {ttcAlert?.ttcSeconds && ttcAlert.ttcSeconds < 50 ? `${ttcAlert.ttcSeconds.toFixed(1)}s` : 'CLEAR (>10s)'}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-mono text-slate-400">LEAD HEADWAY</div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {metrics?.distanceToLeadVehicle && metrics.distanceToLeadVehicle < 90
                ? `${metrics.distanceToLeadVehicle.toFixed(1)}m`
                : '--'}
            </div>
          </div>
        </div>

        {/* TTC Dynamic Warning Message */}
        <div className={`p-2 rounded text-xs font-mono leading-tight ${
          isCriticalTtc
            ? 'bg-rose-500/20 border border-rose-500/50 text-rose-200'
            : isCautionTtc
            ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200'
            : 'bg-[#050A14] border border-[#141E2F] text-slate-400'
        }`}>
          {ttcAlert?.message || 'Nominal clearance on forward ego path.'}
        </div>
      </div>


      {/* 4. Path Deviation & Journey Analytics Card */}
      <div className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-2.5 shadow-lg text-xs font-mono">
        <div className="flex items-center justify-between border-b border-[#1A2638] pb-2 font-bold">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-200 uppercase tracking-wider">PATH DEVIATION</span>
          </div>
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
            pathDev?.journeyStatus === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-cyan-500/20 text-cyan-300'
          }`}>
            {pathDev?.journeyStatus || 'IN_PROGRESS'}
          </span>
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Current Deviation:</span>
            <span className="font-bold text-cyan-400">{pathDev?.currentMeters?.toFixed(3) || '0.000'} m</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Average Lateral Dev:</span>
            <span className="font-bold text-slate-200">{pathDev?.avgMeters?.toFixed(3) || '0.000'} m</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Max Peak Deviation:</span>
            <span className={`font-bold ${(pathDev?.maxMeters || 0) > 1.0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {pathDev?.maxMeters?.toFixed(3) || '0.000'} m
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Lane Keeping Precision:</span>
            <span className="font-bold text-emerald-400">{pathDev?.laneKeepingPrecisionPct ?? 100}%</span>
          </div>
          <div className="flex justify-between text-slate-300 border-t border-[#131F33] pt-1 mt-1">
            <span className="text-slate-400">Distance Travelled:</span>
            <span className="font-bold text-slate-200">{totalDistKm} km</span>
          </div>
        </div>

        {/* Journey Control Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#131F33]">
          <button
            onClick={onEndJourney}
            className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/50 hover:bg-emerald-900/50 text-emerald-300 font-bold transition-all shadow-[0_0_10px_rgba(0,245,155,0.15)]"
          >
            <span>🏁 End Journey</span>
          </button>
          <button
            onClick={onResetTrip}
            className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-[#0A111F] border border-[#1A2638] hover:border-cyan-500 text-slate-300 hover:text-white font-bold transition-all"
          >
            <span>🔄 Reset Trip</span>
          </button>
        </div>
      </div>

      {/* 5. Autonomous Model-Driven Sensor Gating & Matrix */}
      <div className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-3.5 flex flex-col gap-2.5 shadow-lg text-xs font-mono">
        <div className="flex items-center justify-between text-[11px] uppercase font-bold border-b border-[#1A2638] pb-1.5">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Radio className="w-3.5 h-3.5 text-purple-400" />
            <span>AUTONOMOUS SENSOR GATING</span>
          </div>
          <span className="text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/30">AI ADAPTIVE</span>
        </div>

        <div className="grid grid-cols-5 gap-1.5 text-center">
          <div className="flex flex-col items-center gap-1 p-1.5 rounded bg-[#050A14] border border-[#131E30]">
            <span className="text-[10px] text-slate-400 font-bold">CAM</span>
            {getSensorStatusBadge(metrics?.sensorStatus?.camera)}
          </div>
          <div className="flex flex-col items-center gap-1 p-1.5 rounded bg-[#050A14] border border-[#131E30]">
            <span className="text-[10px] text-slate-400 font-bold">LIDAR</span>
            {getSensorStatusBadge(metrics?.sensorStatus?.lidar)}
          </div>
          <div className="flex flex-col items-center gap-1 p-1.5 rounded bg-[#050A14] border border-[#131E30]">
            <span className="text-[10px] text-slate-400 font-bold">RADAR</span>
            {getSensorStatusBadge(metrics?.sensorStatus?.radar)}
          </div>
          <div className="flex flex-col items-center gap-1 p-1.5 rounded bg-[#050A14] border border-[#131E30]">
            <span className="text-[10px] text-slate-400 font-bold">IMU</span>
            {getSensorStatusBadge(metrics?.sensorStatus?.imu)}
          </div>
          <div className="flex flex-col items-center gap-1 p-1.5 rounded bg-[#050A14] border border-[#131E30]">
            <span className="text-[10px] text-slate-400 font-bold">GNSS</span>
            {getSensorStatusBadge(metrics?.sensorStatus?.gnss)}
          </div>
        </div>

        {/* Gating Rationale Subtitle */}
        {sensorOrchestration?.rationale && (
          <div className="p-2 rounded bg-[#050A14] border border-[#142033] text-[10px] text-slate-300 leading-snug">
            <span className="text-purple-400 font-bold">AI Allocation: </span>
            {sensorOrchestration.rationale}
          </div>
        )}
      </div>
    </aside>
  );
};


