import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  Radio, 
  Video, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  ShieldAlert, 
  Sparkles,
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
  LayoutDashboard,
  Terminal
} from 'lucide-react';
import { WebSocketMetrics } from '../types/telemetry';
import { audioManager } from '../utils/audioAlerts';

interface HeaderProps {
  videoMetrics: WebSocketMetrics;
  telemetryMetrics: WebSocketMetrics;
  isMockMode: boolean;
  onToggleMockMode: () => void;
  onEmergencyStop: () => void;
  activeFaultsCount: number;
  activeTab: 'mission' | 'arbiter';
  onTabChange: (tab: 'mission' | 'arbiter') => void;
}

export const Header: React.FC<HeaderProps> = ({
  videoMetrics,
  telemetryMetrics,
  isMockMode,
  onToggleMockMode,
  onEmergencyStop,
  activeFaultsCount,
  activeTab,
  onTabChange,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + `.${Math.floor(now.getMilliseconds() / 100)}`
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 100);
    return () => clearInterval(interval);
  }, []);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioManager.setMuted(newMuted);
    if (!newMuted) {
      audioManager.playClick();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
    audioManager.playClick();
  };

  const getStatusBadge = (metrics: WebSocketMetrics, isSim: boolean) => {
    if (isSim) {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-purple-500/10 text-purple-400 border border-purple-500/30">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
          SYNTHETIC SIM
        </span>
      );
    }

    switch (metrics.status) {
      case 'CONNECTED':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            LIVE
          </span>
        );
      case 'CONNECTING':
      case 'RECONNECTING':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {metrics.status} #{metrics.reconnectCount}
          </span>
        );
      case 'DISCONNECTED':
      case 'ERROR':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <WifiOff className="w-3 h-3" />
            OFFLINE
          </span>
        );
    }
  };

  return (
    <header className="bg-[#080D17]/90 backdrop-blur-md border-b border-[#1A2638] px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
      {/* Left: Brand & System Identifier */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 via-blue-600/10 to-transparent border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.25)]">
          <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
          <div className="absolute -inset-0.5 rounded-lg bg-cyan-400/20 blur-sm -z-10"></div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-wider text-slate-100 uppercase font-mono flex items-center gap-2">
              <span>AURA-AV</span>
              <span className="text-cyan-400 text-xs px-1.5 py-0.2 bg-cyan-950/60 border border-cyan-500/30 rounded font-normal">
                v2.4 DECISION HUD
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <span>AUTONOMOUS PERCEPTION & MULTI-HYPOTHESIS ARBITER</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-500">LEVEL 4/5 TELEMETRY</span>
          </p>
        </div>
      </div>

      {/* Center Navigation Tab Selector */}
      <div className="flex items-center gap-1 bg-[#0A101D] p-1 rounded-xl border border-[#1A2638] shadow-inner">
        <button
          id="tab-mission-hud"
          onClick={() => {
            audioManager.playClick();
            onTabChange('mission');
          }}
          className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'mission'
              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_12px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#0E1726] border border-transparent'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>LIVE MISSION HUD</span>
        </button>

        <button
          id="tab-arbiter-log"
          onClick={() => {
            audioManager.playClick();
            onTabChange('arbiter');
          }}
          className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'arbiter'
              ? 'bg-gradient-to-r from-purple-500/20 to-indigo-600/20 text-purple-300 border border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#0E1726] border border-transparent'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>ARBITER & DECISION LOG</span>
        </button>
      </div>

      {/* Dual WebSocket Live Diagnostics */}
      <div className="hidden xl:flex items-center gap-3 bg-[#0B1220]/80 p-1.5 px-3 rounded-lg border border-[#1E2D45] text-xs font-mono">
        {/* Video WS Monitor */}
        <div className="flex items-center gap-2 pr-3 border-r border-[#1E2D45]">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Video className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 font-medium">/ws/video</span>
          </div>
          {getStatusBadge(videoMetrics, isMockMode)}
          <span className="text-slate-400 text-[11px]">
            {isMockMode ? '60 FPS' : `${videoMetrics.fps} FPS`}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 text-[11px]">
            {isMockMode ? '1.2 MB/s' : `${(videoMetrics.bytesReceived / 1024 / 1024).toFixed(1)} MB`}
          </span>
        </div>

        {/* Telemetry WS Monitor */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 font-medium">/ws/telemetry</span>
          </div>
          {getStatusBadge(telemetryMetrics, isMockMode)}
          <span className="text-slate-400 text-[11px]">
            {isMockMode ? '20 Hz' : `${telemetryMetrics.fps} Hz`}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 text-[11px]">
            {isMockMode ? '< 2ms' : `${telemetryMetrics.latencyMs}ms`}
          </span>
        </div>
      </div>

      {/* Right: Controls, Mode Switcher, Clock & E-Stop */}
      <div className="flex items-center gap-2.5">
        {/* Fault Indicator Banner */}
        {activeFaultsCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/50 text-rose-400 text-xs font-mono animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{activeFaultsCount} FAULT{activeFaultsCount > 1 ? 'S' : ''} ACTIVE</span>
          </div>
        )}

        {/* Mock Sim Toggle Button */}
        <button
          id="toggle-mock-btn"
          onClick={() => {
            audioManager.playClick();
            onToggleMockMode();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono font-medium transition-all border ${
            isMockMode
              ? 'bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)] hover:bg-purple-600/30'
              : 'bg-[#0F172A] text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600'
          }`}
          title="Toggle procedural mock simulation vs live backend"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isMockMode ? 'text-purple-400' : 'text-slate-500'}`} />
          <span>{isMockMode ? 'SIMULATOR ACTIVE' : 'LIVE BACKEND'}</span>
        </button>

        {/* Audio Mute Toggle */}
        <button
          onClick={toggleMute}
          className={`p-1.5 rounded text-slate-400 hover:text-slate-200 bg-[#0F172A] border border-slate-700 hover:border-slate-600 transition-colors`}
          title={isMuted ? 'Unmute HUD Audio Alerts' : 'Mute HUD Audio Alerts'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded text-slate-400 hover:text-slate-200 bg-[#0F172A] border border-slate-700 hover:border-slate-600 transition-colors"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Digital Clock */}
        <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded bg-[#0A0F1D] border border-[#1A2638] text-xs font-mono text-cyan-300">
          <Clock className="w-3 h-3 text-cyan-500" />
          <span>{currentTime}</span>
        </div>

        {/* E-Stop Emergency Button */}
        <button
          id="btn-emergency-stop"
          onClick={() => {
            audioManager.playCriticalAlert();
            onEmergencyStop();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white text-xs font-bold font-mono tracking-wider shadow-[0_0_15px_rgba(255,42,109,0.4)] border border-rose-400/40 transition-transform active:scale-95"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>E-STOP</span>
        </button>
      </div>
    </header>
  );
};
