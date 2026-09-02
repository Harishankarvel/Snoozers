import React from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, Zap } from 'lucide-react';

export const AlertBanner = ({ safetyMetrics }) => {
  const riskScore = safetyMetrics?.collision_risk_score ?? 0.0;
  const rawStatus = safetyMetrics?.alert_status || 'SAFE';

  // Determine state level
  const isCritical = riskScore > 0.6;
  const isCaution = riskScore >= 0.4 && riskScore <= 0.6;
  const isSafe = riskScore < 0.4;

  const riskPercentage = Math.round(Math.min(1.0, Math.max(0.0, riskScore)) * 100);

  const getBannerStyle = () => {
    if (isCritical) {
      return {
        wrapper: 'bg-rose-950/80 border-rose-500 shadow-[0_0_30px_rgba(255,42,109,0.5)] animate-pulse',
        badge: 'bg-rose-600 text-white font-black animate-bounce',
        text: 'text-rose-100',
        title: 'CRITICAL: IMMINENT COLLISION - BRAKING APPLIED',
        icon: <AlertOctagon className="w-6 h-6 text-rose-400 animate-spin" />,
        barFill: 'bg-gradient-to-r from-rose-500 to-red-600',
      };
    }
    if (isCaution) {
      return {
        wrapper: 'bg-amber-950/70 border-amber-500/80 shadow-[0_0_20px_rgba(255,184,0,0.3)] animate-pulse',
        badge: 'bg-amber-500 text-slate-950 font-bold',
        text: 'text-amber-100',
        title: 'CAUTION - PROXIMITY ALERT',
        icon: <AlertTriangle className="w-6 h-6 text-amber-400 animate-bounce" />,
        barFill: 'bg-gradient-to-r from-amber-400 to-orange-500',
      };
    }
    return {
      wrapper: 'bg-[#0B1528]/80 border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]',
      badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      text: 'text-slate-200',
      title: 'SYSTEM NOMINAL - SAFE',
      icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />,
      barFill: 'bg-gradient-to-r from-cyan-500 to-emerald-400',
    };
  };

  const style = getBannerStyle();

  return (
    <div className={`w-full rounded-xl border p-3.5 backdrop-blur-md transition-all duration-300 flex flex-col gap-2.5 ${style.wrapper}`}>
      {/* Top Banner Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-black/40 border border-white/10">
            {style.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                AI COLLISION PREDICTOR (CNN + LSTM)
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider ${style.badge}`}>
                {isCritical ? 'ALERT LVL 3' : isCaution ? 'ALERT LVL 2' : 'NOMINAL'}
              </span>
            </div>
            <h2 className={`text-sm sm:text-base font-bold font-mono tracking-wide mt-0.5 ${style.text}`}>
              {style.title}
            </h2>
          </div>
        </div>

        {/* Numerical Probability Badge */}
        <div className="flex items-baseline gap-1.5 font-mono px-3 py-1.5 rounded-lg bg-black/50 border border-white/10">
          <span className="text-xs text-slate-400">RISK:</span>
          <span className={`text-xl font-extrabold ${isCritical ? 'text-rose-400' : isCaution ? 'text-amber-400' : 'text-cyan-400'}`}>
            {riskPercentage}%
          </span>
          <span className="text-[11px] text-slate-500">({riskScore.toFixed(3)})</span>
        </div>
      </div>

      {/* Collision Risk Progress Bar */}
      <div className="flex flex-col gap-1">
        <div className="relative w-full h-2.5 bg-[#070D18] rounded-full overflow-hidden border border-white/10">
          {/* Threshold markers */}
          <div className="absolute left-[40%] top-0 bottom-0 w-0.5 bg-amber-500/40 z-10" title="Caution threshold (40%)"></div>
          <div className="absolute left-[60%] top-0 bottom-0 w-0.5 bg-rose-500/50 z-10" title="Critical threshold (60%)"></div>

          {/* Active Fill */}
          <div
            className={`h-full transition-all duration-150 ease-out ${style.barFill}`}
            style={{ width: `${riskPercentage}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>0.0 (SAFE)</span>
          <span className="text-amber-400/80">0.40 (CAUTION)</span>
          <span className="text-rose-400/80">0.60 (CRITICAL)</span>
          <span>1.0 (MAX)</span>
        </div>
      </div>
    </div>
  );
};

export default AlertBanner;
