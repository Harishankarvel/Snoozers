import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Pause, 
  Play, 
  Trash2, 
  Download, 
  Filter, 
  Search, 
  Info, 
  AlertCircle, 
  CheckCircle, 
  ChevronRight,
  ChevronDown,
  Code
} from 'lucide-react';
import { AVDecision, TelemetryPacket } from '../types/telemetry';
import { audioManager } from '../utils/audioAlerts';

interface DecisionLogProps {
  latestTelemetry: TelemetryPacket | null;
  isFullTab?: boolean;
  className?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  confidence: number;
  targetSpeed: number;
  reasoning: Record<string, string>;
  primaryReason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  rawTelemetry?: any;
}

export const DecisionLog: React.FC<DecisionLogProps> = ({ 
  latestTelemetry,
  isFullTab = false,
  className = ''
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const lastLoggedActionRef = useRef<string>('');
  const lastLoggedTimeRef = useRef<number>(0);

  // Parse incoming decisions from telemetry stream
  useEffect(() => {
    if (!latestTelemetry || !latestTelemetry.decision) return;

    const decision = latestTelemetry.decision;
    const now = Date.now();

    // Log if action changed or every 1.5s for nominal maintain updates to keep feed alive without flooding
    const shouldLog =
      decision.action !== lastLoggedActionRef.current ||
      decision.urgency === 'critical' ||
      decision.urgency === 'high' ||
      now - lastLoggedTimeRef.current > 1200;

    if (shouldLog) {
      lastLoggedActionRef.current = decision.action;
      lastLoggedTimeRef.current = now;

      const newEntry: LogEntry = {
        id: `${decision.id}-${now}`,
        timestamp: typeof decision.timestamp === 'string' ? decision.timestamp : new Date().toISOString().split('T')[1].slice(0, 12),
        action: decision.action,
        confidence: decision.confidence,
        targetSpeed: decision.targetSpeedKmh,
        reasoning: decision.reasoning,
        primaryReason: decision.primaryReason,
        urgency: decision.urgency,
        rawTelemetry: latestTelemetry,
      };

      setLogs((prev) => {
        const updated = [...prev, newEntry];
        return updated.length > 250 ? updated.slice(updated.length - 250) : updated;
      });
    }
  }, [latestTelemetry]);

  // Auto-scroll when new log arrives if enabled
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  const clearLogs = () => {
    audioManager.playClick();
    setLogs([]);
  };

  const exportLogs = () => {
    audioManager.playClick();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `av-decision-logs-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getActionBadgeClass = (action: string, urgency: string) => {
    if (urgency === 'critical' || action.includes('Emergency')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
    }
    if (action.includes('Brake')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
    }
    if (action.includes('Swerve') || action.includes('Lane')) {
      return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
    }
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
  };

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'ALL' && !log.action.toUpperCase().includes(filterAction)) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.primaryReason.toLowerCase().includes(q) ||
        JSON.stringify(log.reasoning).toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <section className={`bg-[#080D17]/90 backdrop-blur-md rounded-xl border border-[#1A2638] flex flex-col shadow-lg overflow-hidden ${
      isFullTab ? 'h-[540px] lg:h-[calc(100vh-340px)] min-h-[460px]' : 'h-[340px]'
    } ${className}`}>
      {/* Terminal Titlebar & Header */}
      <div className="bg-[#0A101D] px-4 py-2.5 border-b border-[#1A2638] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            AUTONOMOUS DECISION STREAM & ARBITER LOG
          </h2>
          <span className="text-[11px] font-mono text-slate-500">
            ({filteredLogs.length} events)
          </span>
        </div>

        {/* Filter & Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Action Filter Selector */}
          <div className="flex items-center gap-1 bg-[#050A14] p-0.5 rounded border border-[#1A2638] text-[11px] font-mono">
            {['ALL', 'CRITICAL', 'BRAKE', 'SWERVE', 'MAINTAIN'].map((f) => (
              <button
                key={f}
                onClick={() => {
                  audioManager.playClick();
                  setFilterAction(f);
                }}
                className={`px-2 py-0.5 rounded transition-colors ${
                  filterAction === f
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#050A14] border border-[#1A2638] rounded pl-7 pr-2 py-0.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 w-28 sm:w-36"
            />
          </div>

          {/* Auto-Scroll Toggle */}
          <button
            onClick={() => {
              audioManager.playClick();
              setAutoScroll(!autoScroll);
            }}
            className={`p-1 rounded border text-xs font-mono flex items-center gap-1 px-1.5 transition-colors ${
              autoScroll
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-[#050A14] text-slate-400 border-[#1A2638] hover:text-slate-200'
            }`}
            title={autoScroll ? 'Pause Auto-Scroll' : 'Resume Auto-Scroll'}
          >
            {autoScroll ? <Pause className="w-3 h-3 text-cyan-400" /> : <Play className="w-3 h-3" />}
            <span className="hidden sm:inline">{autoScroll ? 'LIVE SCROLL' : 'PAUSED'}</span>
          </button>

          {/* Export JSON */}
          <button
            onClick={exportLogs}
            className="p-1.5 rounded bg-[#050A14] border border-[#1A2638] text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
            title="Export Decision Log (JSON)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Clear Logs */}
          <button
            onClick={clearLogs}
            className="p-1.5 rounded bg-[#050A14] border border-[#1A2638] text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
            title="Clear Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Scrolling Log Area */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-1.5 bg-[#05070D] select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
            [WAITING FOR DECISION STREAM TELEMETRY PACKETS...]
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div
                key={log.id}
                className={`p-2 rounded border transition-all ${
                  log.urgency === 'critical'
                    ? 'bg-rose-950/25 border-rose-500/40 hover:bg-rose-950/40'
                    : 'bg-[#090F1B]/90 border-[#141F30] hover:border-[#1E304B]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Timestamp */}
                    <span className="text-slate-500 text-[11px] font-mono">
                      [{log.timestamp}]
                    </span>

                    {/* Action Badge */}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono ${getActionBadgeClass(
                        log.action,
                        log.urgency
                      )}`}
                    >
                      {log.action.toUpperCase()}
                    </span>

                    {/* Target Speed & Confidence */}
                    <span className="text-cyan-400 text-[11px]">
                      CONF: {(log.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      TARGET: {log.targetSpeed} KM/H
                    </span>
                  </div>

                  {/* Expand / Raw Details Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                      title="Inspect Raw Telemetry JSON"
                    >
                      <Code className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
                      title="Toggle Hypothesis Reasoning"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Primary Decision Reason */}
                <div className="mt-1 text-slate-200 text-[11px] leading-relaxed">
                  <span className="text-cyan-400 font-semibold">&gt; </span>
                  {log.primaryReason}
                </div>

                {/* Multi-Hypothesis Counterfactual Reasoning Breakdown (Accordion) */}
                {isExpanded && log.reasoning && Object.keys(log.reasoning).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#162338] space-y-1 text-[11px] bg-[#050912] p-2 rounded">
                    <div className="text-[10px] uppercase font-bold text-slate-400 pb-1">
                      MULTI-HYPOTHESIS COUNTERFACTUAL EVALUATION:
                    </div>
                    {Object.entries(log.reasoning).map(([hypo, text]) => (
                      <div key={hypo} className="flex items-start gap-2">
                        <span className={`px-1 rounded text-[9px] font-bold ${
                          hypo === log.action ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {hypo}
                        </span>
                        <span className="text-slate-300">{text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Raw JSON Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B1220] border border-[#1E2D45] rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-3 border-b border-[#1E2D45] flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
                <Code className="w-4 h-4 text-cyan-400" />
                <span>TELEMETRY PACKET INSPECTOR - ID: {selectedLog.id}</span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white text-xs font-mono"
              >
                CLOSE
              </button>
            </div>
            <pre className="flex-1 p-4 overflow-auto font-mono text-xs text-cyan-300 bg-[#05080F] select-text">
              {JSON.stringify(selectedLog.rawTelemetry || selectedLog, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
};
