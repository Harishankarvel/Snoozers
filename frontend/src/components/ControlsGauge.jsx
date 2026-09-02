import React from 'react';
import { Gauge, Compass, Disc, Zap, Activity } from 'lucide-react';

export const ControlsGauge = ({ kinematics, controlSignals }) => {
  const speed = kinematics?.speed_kmh ?? 0;
  const steering = kinematics?.steering_angle ?? 0;
  const throttle = controlSignals?.throttle_pct ?? 0;
  const brake = controlSignals?.brake_pressure ?? 0;
  const gear = controlSignals?.gear || 'D';
  const driveMode = controlSignals?.drive_mode || 'Autonomous';

  // Radial arc calculation (0 to 140 km/h)
  const maxSpeed = 140;
  const speedRatio = Math.min(1, Math.max(0, speed / maxSpeed));
  const arcStrokeDash = 220;
  const arcOffset = arcStrokeDash - arcStrokeDash * speedRatio;

  const gears = ['P', 'R', 'N', 'D'];

  return (
    <div className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-3 shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#1A2638] pb-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            KINEMATICS & CONTROL SIGNALS
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
          driveMode === 'Autonomous'
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
        }`}>
          {driveMode.toUpperCase()}
        </span>
      </div>

      {/* Speedometer Radial Arc & Digital Readout */}
      <div className="relative flex flex-col items-center justify-center py-1">
        <svg className="w-44 h-28 transform -rotate-90" viewBox="0 0 100 60">
          {/* Track Arc */}
          <path
            d="M 15 50 A 35 35 0 0 1 85 50"
            fill="none"
            stroke="#131F33"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {/* Dynamic Speed Arc */}
          <path
            d="M 15 50 A 35 35 0 0 1 85 50"
            fill="none"
            stroke={brake > 50 ? '#FF2A6D' : '#00F0FF'}
            strokeWidth="7"
            strokeDasharray={arcStrokeDash}
            strokeDashoffset={arcOffset}
            strokeLinecap="round"
            className="transition-all duration-150 ease-out"
          />
        </svg>

        <div className="absolute top-7 flex flex-col items-center">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold font-mono text-slate-100 tracking-tight">
              {speed.toFixed(0)}
            </span>
            <span className="text-xs font-mono font-bold text-cyan-400">KM/H</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            {(speed * 0.621371).toFixed(0)} MPH
          </span>
        </div>
      </div>

      {/* Gear Shift Matrix */}
      <div className="flex justify-center gap-2 bg-[#050A14] p-1.5 rounded-lg border border-[#141E2F]">
        {gears.map((g) => (
          <span
            key={g}
            className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all ${
              gear === g
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                : 'text-slate-600'
            }`}
          >
            {g}
          </span>
        ))}
      </div>

      {/* Steering Angle Indicator */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-[#050A14] border border-[#141E2F] text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-400">
          <Compass
            className="w-4 h-4 text-cyan-400 transition-transform duration-100"
            style={{ transform: `rotate(${steering * 2}deg)` }}
          />
          <span>STEERING ANGLE</span>
        </div>
        <span className="font-bold text-slate-200">
          {steering > 0 ? `+${steering.toFixed(1)}°` : `${steering.toFixed(1)}°`}
        </span>
      </div>

      {/* Vertical Pedal Meters: Throttle % & Brake Pressure % */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#131F33]">
        {/* Throttle Meter */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-slate-400">THROTTLE</span>
            <span className="text-cyan-300 font-bold">{throttle}%</span>
          </div>
          <div className="w-full h-2 bg-[#131F33] rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-150"
              style={{ width: `${throttle}%` }}
            />
          </div>
        </div>

        {/* Brake Pressure Meter */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-slate-400">BRAKE PRESSURE</span>
            <span className={`font-bold ${brake > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
              {brake}%
            </span>
          </div>
          <div className="w-full h-2 bg-[#131F33] rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all duration-150"
              style={{ width: `${brake}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlsGauge;
