import React, { useState } from 'react';
import { 
  Sliders, 
  AlertTriangle, 
  UserX, 
  CloudRain, 
  ShieldAlert, 
  RotateCcw, 
  Zap, 
  EyeOff, 
  Radio
} from 'lucide-react';
import { FaultInjectionPayload } from '../types/telemetry';
import { audioManager } from '../utils/audioAlerts';

interface ControlPanelProps {
  onInjectFault: (payload: FaultInjectionPayload) => void;
  activeFaults: string[];
  className?: string;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
  onInjectFault, 
  activeFaults,
  className = ''
}) => {
  const handleQuickAction = (faultType: string, customPayload?: Partial<FaultInjectionPayload>) => {
    audioManager.playInjection();
    const payload: FaultInjectionPayload = {
      action: 'inject_fault',
      faultType,
      severity: 'high',
      durationSec: 8,
      ...customPayload,
    };
    onInjectFault(payload);
  };

  const isFaultActive = (type: string) => activeFaults.includes(type);

  return (
    <section className={`bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-3 sm:p-3.5 flex flex-col gap-2.5 shadow-lg ${className}`}>
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-[#1A2638] pb-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            EDGE-CASE & FAULT INJECTION CONTROLS
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-[10px]">20 Hz WS</span>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {/* 1. Cut-In Vehicle */}
        <button
          id="btn-fault-cutin"
          onClick={() => handleQuickAction('cut_in_vehicle')}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all active:scale-95 ${
            isFaultActive('cut_in_vehicle')
              ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(255,42,109,0.3)] animate-pulse'
              : 'bg-[#0A101D] border-[#1A2638] text-slate-300 hover:border-cyan-500/50 hover:bg-[#0E1626]'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 mb-0.5" />
          <span className="text-[11px] font-mono font-bold">Cut-In Car</span>
          <span className="text-[9px] font-mono text-slate-500">Diagonal Slide</span>
        </button>

        {/* 2. Jaywalking Pedestrian */}
        <button
          id="btn-fault-pedestrian"
          onClick={() => handleQuickAction('pedestrian_jaywalking')}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all active:scale-95 ${
            isFaultActive('pedestrian_jaywalking')
              ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(255,42,109,0.3)] animate-pulse'
              : 'bg-[#0A101D] border-[#1A2638] text-slate-300 hover:border-cyan-500/50 hover:bg-[#0E1626]'
          }`}
        >
          <UserX className="w-4 h-4 text-rose-400 mb-0.5" />
          <span className="text-[11px] font-mono font-bold">Jaywalking</span>
          <span className="text-[9px] font-mono text-slate-500">Front Corridor</span>
        </button>

        {/* 3. Pothole / Road Surface Crater */}
        <button
          id="btn-fault-pothole"
          onClick={() => handleQuickAction('pothole_hazard')}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all active:scale-95 ${
            isFaultActive('pothole_hazard')
              ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(250,204,21,0.3)] animate-pulse'
              : 'bg-[#0A101D] border-[#1A2638] text-slate-300 hover:border-amber-500/50 hover:bg-[#0E1626]'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400 mb-0.5" />
          <span className="text-[11px] font-mono font-bold">Pothole</span>
          <span className="text-[9px] font-mono text-slate-500">Swerve Evasion</span>
        </button>

        {/* 4. Sudden Lead Braking */}
        <button
          id="btn-fault-brake"
          onClick={() => handleQuickAction('sudden_brake')}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all active:scale-95 ${
            isFaultActive('sudden_brake')
              ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(255,42,109,0.3)] animate-pulse'
              : 'bg-[#0A101D] border-[#1A2638] text-slate-300 hover:border-cyan-500/50 hover:bg-[#0E1626]'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-rose-400 mb-0.5" />
          <span className="text-[11px] font-mono font-bold">Hard Brake</span>
          <span className="text-[9px] font-mono text-slate-500">-8.5 m/s² Decel</span>
        </button>

        {/* 5. Weather Degradation */}
        <button
          id="btn-fault-weather"
          onClick={() => handleQuickAction('weather_degradation')}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all active:scale-95 ${
            isFaultActive('weather_degradation')
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.3)] animate-pulse'
              : 'bg-[#0A101D] border-[#1A2638] text-slate-300 hover:border-cyan-500/50 hover:bg-[#0E1626]'
          }`}
        >
          <CloudRain className="w-4 h-4 text-cyan-400 mb-0.5" />
          <span className="text-[11px] font-mono font-bold">Weather</span>
          <span className="text-[9px] font-mono text-slate-500">Rain / Fog</span>
        </button>

        {/* 6. Sensor Blindspot */}
        <button
          id="btn-fault-blindspot"
          onClick={() => handleQuickAction('sensor_blindspot')}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all active:scale-95 ${
            isFaultActive('sensor_blindspot')
              ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)] animate-pulse'
              : 'bg-[#0A101D] border-[#1A2638] text-slate-300 hover:border-cyan-500/50 hover:bg-[#0E1626]'
          }`}
        >
          <EyeOff className="w-4 h-4 text-purple-400 mb-0.5" />
          <span className="text-[11px] font-mono font-bold">Blindspot</span>
          <span className="text-[9px] font-mono text-slate-500">Right Occlusion</span>
        </button>

        {/* 7. Reset / Clear All Faults */}
        <button
          id="btn-fault-reset"
          onClick={() => {
            audioManager.playClick();
            onInjectFault({ action: 'reset_simulation' });
          }}
          className="flex flex-col items-center justify-center p-2 rounded-lg border border-[#1A2638] bg-[#0A101D] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 hover:bg-[#0E1626] text-center transition-all active:scale-95"
        >
          <RotateCcw className="w-4 h-4 text-emerald-400 mb-0.5" />
          <span className="text-[11px] font-mono font-bold">Reset Nominal</span>
          <span className="text-[9px] font-mono text-slate-500">Clear All</span>
        </button>
      </div>
    </section>
  );
};
