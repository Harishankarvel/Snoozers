import React from 'react';
import { WifiOff, RefreshCw, Server, AlertCircle } from 'lucide-react';

export const ConnectionModal = ({ isConnected, isConnecting, wsUrl, onReconnect, onToggleSim }) => {
  if (isConnected) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0B1220] border border-[#1E2D45] rounded-xl max-w-md w-full p-6 flex flex-col items-center text-center shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
          <WifiOff className="w-7 h-7 animate-pulse" />
        </div>

        <h2 className="text-lg font-bold font-mono text-slate-100 tracking-wide">
          Connecting to AV Telemetry Server...
        </h2>
        <p className="text-xs font-mono text-slate-400 mt-2">
          Attempting connection to WebSocket stream at:
        </p>
        <code className="text-xs font-mono text-cyan-400 bg-[#050A14] px-3 py-1.5 rounded-lg border border-[#1A2638] mt-2 mb-4">
          {wsUrl}
        </code>

        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={onReconnect}
            disabled={isConnecting}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold shadow-[0_0_15px_rgba(0,240,255,0.25)] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} />
            <span>{isConnecting ? 'RECONNECTING...' : 'RECONNECT TO BACKEND'}</span>
          </button>

          <button
            onClick={onToggleSim}
            className="w-full py-2 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 text-slate-300 font-mono text-xs font-medium transition-colors"
          >
            ✨ SWITCH TO BUILT-IN SIMULATOR DEMO
          </button>
        </div>

        <div className="mt-4 text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5" />
          <span>Make sure FastAPI is running with: <code>python app.py</code> (Port 8080 or 8000)</span>
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
