import React from 'react';
import { 
  Terminal, 
  Cpu, 
  Activity, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Compass, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  Gauge, 
  Layers, 
  Sliders,
  Sparkles
} from 'lucide-react';
import { TelemetryPacket } from '../types/telemetry';
import { DecisionLog } from './DecisionLog';

interface ArbiterDecisionTabProps {
  latestTelemetry: TelemetryPacket | null;
  activeFaults: string[];
}

export const ArbiterDecisionTab: React.FC<ArbiterDecisionTabProps> = ({
  latestTelemetry,
  activeFaults
}) => {
  const decision = latestTelemetry?.decision;
  const metrics = latestTelemetry?.metrics;
  const hypotheses = decision?.reasoning || {};
  const currentAction = decision?.action || 'Maintain Course';
  const confidence = decision?.confidence ? (decision.confidence * 100).toFixed(1) : '96.0';
  const urgency = decision?.urgency || 'low';
  const latency = metrics?.inferenceLatencyMs ? metrics.inferenceLatencyMs.toFixed(2) : '0.85';
  const targetSpeed = decision?.targetSpeedKmh ?? (metrics?.targetSpeedKmh ?? 70);
  const egoSpeed = metrics?.speedKmh ?? 0;
  const safetyGrade = metrics?.journeySummary?.aiSafetyGrade || 'A+ (99.4%)';

  const getUrgencyBadge = (urg: string) => {
    switch (urg) {
      case 'critical':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            CRITICAL HAZARD
          </span>
        );
      case 'high':
      case 'medium':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ELEVATED CAUTION
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            NOMINAL CLEARANCE
          </span>
        );
    }
  };

  const getActionColor = (act: string) => {
    if (act.includes('Emergency') || act.includes('Yielding') || act.includes('Takeover')) {
      return 'text-rose-400 border-rose-500/50 bg-rose-950/30';
    }
    if (act.includes('Brake') || act.includes('Slow')) {
      return 'text-amber-400 border-amber-500/50 bg-amber-950/30';
    }
    if (act.includes('Swerve') || act.includes('Lane')) {
      return 'text-purple-400 border-purple-500/50 bg-purple-950/30';
    }
    return 'text-cyan-400 border-cyan-500/50 bg-cyan-950/30';
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4 w-full">
      {/* Top Banner: Real-Time Arbiter Consensus Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
        {/* Card 1: Live Arbitrated Decision */}
        <div className="lg:col-span-2 bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div>
            <div className="flex items-center justify-between border-b border-[#1A2638] pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Cpu className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-xs font-mono font-bold tracking-wider text-slate-100 uppercase">
                    ACTIVE ARBITER ACTION CONSENSUS
                  </h2>
                  <p className="text-[10px] font-mono text-slate-500">
                    ML-DRIVEN MULTI-HYPOTHESIS RESOLUTION ENGINE
                  </p>
                </div>
              </div>
              {getUrgencyBadge(urgency)}
            </div>

            {/* Decision Headline Box */}
            <div className={`p-3.5 rounded-lg border flex flex-col gap-1.5 ${getActionColor(currentAction)}`}>
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Selected Trajectory Maneuver</span>
                <span className="text-cyan-300 font-bold">{confidence}% ARBITER CONFIDENCE</span>
              </div>
              <div className="text-base sm:text-lg font-bold font-mono tracking-wide text-slate-100">
                {currentAction}
              </div>
              <p className="text-xs font-mono text-slate-300">
                {decision?.primaryReason || 'Forward travel corridor is clear. Maintaining autonomous cruise envelope.'}
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-3 border-t border-[#1A2638] text-xs font-mono">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase">Target Speed</span>
              <span className="font-bold text-slate-200">{targetSpeed} km/h</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase">Current Velocity</span>
              <span className="font-bold text-cyan-400">{egoSpeed.toFixed(1)} km/h</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase">Inference Latency</span>
              <span className="font-bold text-purple-400">{latency} ms</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase">Safety Rating</span>
              <span className="font-bold text-emerald-400">{safetyGrade}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Candidate Hypotheses Evaluated */}
        <div className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col shadow-lg">
          <div className="flex items-center justify-between border-b border-[#1A2638] pb-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                HYPOTHESIS ARBITRATION
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-[#050A14] px-2 py-0.5 rounded border border-[#1A2638]">
              {Object.keys(hypotheses).length || 3} HYPOTHESES
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[170px] pr-1">
            {Object.keys(hypotheses).length > 0 ? (
              Object.entries(hypotheses).map(([hypothesis, reason]) => {
                const isAccepted = typeof reason === 'string' && (reason.includes('ACCEPTED') || reason.includes('OPTIMAL') || reason.includes('CRITICAL'));
                return (
                  <div 
                    key={hypothesis} 
                    className={`p-2 rounded border text-xs font-mono flex flex-col gap-0.5 transition-all ${
                      isAccepted 
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200' 
                        : 'bg-[#050A14] border-[#141E2F] text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center gap-1.5">
                        {isAccepted ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span className={isAccepted ? 'text-emerald-300' : 'text-slate-300'}>
                          {hypothesis}
                        </span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        isAccepted ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {isAccepted ? 'ACCEPTED' : 'REJECTED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 pl-5">
                      {reason}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs font-mono py-4">
                <Activity className="w-5 h-5 text-slate-600 mb-1 animate-pulse" />
                <span>Evaluating dynamic risk hypotheses...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Section: High-Density Interactive Decision Log Terminal */}
      <div className="w-full flex-1">
        <DecisionLog latestTelemetry={latestTelemetry} isFullTab={true} />
      </div>
    </div>
  );
};
