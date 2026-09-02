import React from 'react';
import { Target, Car, User, Bike, Truck, Bus, AlertCircle } from 'lucide-react';

export const TelemetryPanel = ({ objects = [], collisionRiskScore = 0.0, timestampMs = 0 }) => {
  const getIcon = (cls) => {
    switch (cls?.toLowerCase()) {
      case 'car':
        return <Car className="w-3.5 h-3.5 text-cyan-400" />;
      case 'pedestrian':
        return <User className="w-3.5 h-3.5 text-amber-400" />;
      case 'cyclist':
      case 'motorcycle':
        return <Bike className="w-3.5 h-3.5 text-purple-400" />;
      case 'truck':
        return <Truck className="w-3.5 h-3.5 text-blue-400" />;
      case 'bus':
        return <Bus className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Target className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] p-4 flex flex-col gap-3 shadow-lg h-full">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#1A2638] pb-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="font-bold tracking-wider text-slate-200 uppercase">
            DETECTED OBSTACLES LOG
          </span>
        </div>
        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
          {objects.length} TRACKED
        </span>
      </div>

      {/* Tracked Objects Stream List */}
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[380px] pr-1">
        {objects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs font-mono text-center">
            <Target className="w-8 h-8 text-slate-700 mb-2 animate-pulse" />
            <span>NO ACTIVE PERCEPTION TARGETS IN FORWARD CONE</span>
          </div>
        ) : (
          objects.map((obj, i) => {
            const isHazard = collisionRiskScore > 0.6;
            const conf = Math.round((obj.confidence || 0.85) * 100);
            const bbox = obj.bbox_2d || [0, 0, 0, 0];

            return (
              <div
                key={`obs-${i}-${obj.class}`}
                className={`p-2.5 rounded-lg border text-xs font-mono transition-all ${
                  isHazard
                    ? 'bg-rose-950/30 border-rose-500/50'
                    : 'bg-[#050A14] border-[#141E2F] hover:border-[#1E304B]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-100">
                    {getIcon(obj.class)}
                    <span>{obj.class} #{i + 1}</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[10px] font-bold">
                    CONF: {conf}%
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 bg-black/40 px-2 py-1 rounded">
                  <span>BBOX [xyxy]:</span>
                  <span className="text-slate-300">
                    [{bbox.map((v) => Math.round(v)).join(', ')}]
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Frame Timestamp Watermark */}
      <div className="pt-2 border-t border-[#131F33] flex justify-between items-center text-[10px] font-mono text-slate-500">
        <span>MODEL: YOLOv8n + CNN-LSTM</span>
        <span>FRAME TIME: {timestampMs} ms</span>
      </div>
    </div>
  );
};

export default TelemetryPanel;
