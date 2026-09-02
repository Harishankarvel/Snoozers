import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { MainVideoFeed } from './components/MainVideoFeed';
import { TelemetrySidebar } from './components/TelemetrySidebar';
import { ControlPanel } from './components/ControlPanel';
import { SensorConfidencePanel } from './components/SensorConfidencePanel';
import { DecisionLog, LogEntry } from './components/DecisionLog';
import { ArbiterDecisionTab } from './components/ArbiterDecisionTab';
import { SensorMatrixTab } from './components/SensorMatrixTab';
import { EndJourneyModal } from './components/EndJourneyModal';
import { 
  FaultInjectionPayload, 
  TelemetryPacket, 
  WebSocketMetrics 
} from './types/telemetry';
import { avWebSocketService } from './services/websocketService';
import { mockSimulationEngine } from './services/mockSimulation';

export const App: React.FC = () => {
  // Navigation Tab State: 'mission' (Page 1: Live HUD), 'arbiter' (Page 2: Decision Log), 'matrix' (Page 3: Sensor Matrix & Gating)
  const [activeTab, setActiveTab] = useState<'mission' | 'arbiter' | 'matrix'>('mission');

  // Mode toggle: Default to false (Live Backend Mode ws://localhost:8000)
  const [isMockMode, setIsMockMode] = useState(false);

  // Metrics for dual WebSockets
  const [videoMetrics, setVideoMetrics] = useState<WebSocketMetrics>(avWebSocketService.videoSocket.metrics);
  const [telemetryMetrics, setTelemetryMetrics] = useState<WebSocketMetrics>(avWebSocketService.telemetrySocket.metrics);

  // Throttled telemetry state for UI widgets (20Hz)
  const [currentTelemetry, setCurrentTelemetry] = useState<TelemetryPacket | null>(null);

  // Persistent Global Decision Logs (Stored continuously from start of journey)
  const [decisionLogs, setDecisionLogs] = useState<LogEntry[]>([]);
  const lastLoggedActionRef = useRef<string>('');
  const lastLoggedTimeRef = useRef<number>(0);

  // Ref-based zero-latency pipeline for Canvas rendering
  const latestTelemetryRef = useRef<TelemetryPacket | null>(null);
  const latestFrameBlobRef = useRef<Blob | ArrayBuffer | null>(null);

  // Active faults tracker
  const [activeFaults, setActiveFaults] = useState<string[]>([]);

  // End Journey modal state
  const [isEndJourneyModalOpen, setIsEndJourneyModalOpen] = useState(false);

  // Continuous Global Decision Logging starting from app load
  useEffect(() => {
    if (!currentTelemetry || !currentTelemetry.decision) return;

    const decision = currentTelemetry.decision;
    const now = Date.now();

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
        rawTelemetry: currentTelemetry,
      };

      setDecisionLogs((prev) => {
        const updated = [...prev, newEntry];
        return updated.length > 500 ? updated.slice(updated.length - 500) : updated;
      });
    }
  }, [currentTelemetry]);

  useEffect(() => {
    // 1. Initialize real WebSocket client listeners
    avWebSocketService.init();

    const unsubVideoStatus = avWebSocketService.videoSocket.onStatusChange((m) => {
      setVideoMetrics({ ...m });
      if (m.status === 'CONNECTED') {
        setIsMockMode(false);
      }
    });

    const unsubTelemetryStatus = avWebSocketService.telemetrySocket.onStatusChange((m) => {
      setTelemetryMetrics({ ...m });
    });

    // Real video frames subscription
    const unsubVideoFrames = avWebSocketService.videoSocket.subscribe((frameData: Blob | ArrayBuffer) => {
      if (!isMockMode) {
        latestFrameBlobRef.current = frameData;
      }
    });

    // Real telemetry packets subscription
    const unsubTelemetryPackets = avWebSocketService.telemetrySocket.subscribe((packet: any) => {
      if (!isMockMode && packet && packet.decision) {
        latestTelemetryRef.current = packet;
        setCurrentTelemetry(packet);
        if (packet.activeFaults) {
          setActiveFaults(packet.activeFaults);
        }
      }
    });

    // 2. Setup Mock Simulation Callbacks
    mockSimulationEngine.setCallbacks(
      (blob) => {
        if (isMockMode) {
          latestFrameBlobRef.current = blob;
        }
      },
      (packet) => {
        if (isMockMode) {
          latestTelemetryRef.current = packet;
          setCurrentTelemetry(packet);
          if (packet.activeFaults) {
            setActiveFaults(packet.activeFaults);
          }
        }
      }
    );

    mockSimulationEngine.start();

    return () => {
      unsubVideoStatus();
      unsubTelemetryStatus();
      unsubVideoFrames();
      unsubTelemetryPackets();
      avWebSocketService.destroy();
      mockSimulationEngine.stop();
    };
  }, []);

  // Sync mock engine running state with toggle
  useEffect(() => {
    if (isMockMode) {
      mockSimulationEngine.start();
    } else {
      mockSimulationEngine.stop();
    }
  }, [isMockMode]);

  // Handle Fault Injections (sent to both WebSocket and Mock Engine)
  const handleInjectFault = (payload: FaultInjectionPayload) => {
    if (isMockMode) {
      mockSimulationEngine.injectFault(payload);
    } else {
      avWebSocketService.sendFaultInjection(payload);
    }
  };

  const handleEmergencyStop = () => {
    handleInjectFault({
      action: 'emergency_takeover',
      faultType: 'emergency_stop',
      severity: 'critical',
    });
  };

  const handleEndJourney = () => {
    handleInjectFault({ action: 'complete_journey' });
    setIsEndJourneyModalOpen(true);
  };

  const handleResetTrip = () => {
    handleInjectFault({ action: 'reset_journey' });
    setIsEndJourneyModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#05070B] text-slate-100 flex flex-col antialiased font-sans select-none">
      {/* Top Fixed Header with 3-Page Tab Navigation */}
      <Header
        videoMetrics={videoMetrics}
        telemetryMetrics={telemetryMetrics}
        isMockMode={isMockMode}
        onToggleMockMode={() => setIsMockMode(!isMockMode)}
        onEmergencyStop={handleEmergencyStop}
        activeFaultsCount={activeFaults.length}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Tabbed Application View (Persistently mounted across tab switches) */}
      <main className="flex-1 p-3 sm:p-4 max-w-[1920px] w-full mx-auto flex flex-col gap-3 sm:gap-4">
        {/* PAGE 1: LIVE MISSION HUD */}
        <div className={activeTab === 'mission' ? 'block' : 'hidden'}>
          <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-start animate-in fade-in duration-200">
            <div className="flex-1 flex flex-col gap-3 sm:gap-4 min-w-0 w-full">
              <MainVideoFeed
                latestTelemetryRef={latestTelemetryRef}
                latestFrameBlobRef={latestFrameBlobRef}
                isMockMode={isMockMode}
              />
              <ControlPanel
                onInjectFault={handleInjectFault}
                activeFaults={activeFaults}
              />
            </div>
            <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] flex-shrink-0 flex flex-col gap-3 sm:gap-4">
              <TelemetrySidebar 
                telemetry={currentTelemetry}
                onEndJourney={handleEndJourney}
                onResetTrip={handleResetTrip}
              />
            </div>
          </div>
        </div>

        {/* PAGE 2: DEDICATED ARBITER DECISION STREAM & EXPLAINABILITY LOG */}
        <div className={activeTab === 'arbiter' ? 'block' : 'hidden'}>
          <ArbiterDecisionTab
            latestTelemetry={currentTelemetry}
            activeFaults={activeFaults}
            logs={decisionLogs}
            setLogs={setDecisionLogs}
            isActive={activeTab === 'arbiter'}
          />
        </div>

        {/* PAGE 3: SENSOR CONFIDENCE MATRIX & DYNAMIC SENSOR GATING */}
        <div className={activeTab === 'matrix' ? 'block' : 'hidden'}>
          <SensorMatrixTab
            latestTelemetry={currentTelemetry}
            onInjectFault={handleInjectFault}
            activeFaults={activeFaults}
            isActive={activeTab === 'matrix'}
          />
        </div>
      </main>

      {/* End of Journey Summary Modal */}
      <EndJourneyModal
        summary={currentTelemetry?.metrics?.journeySummary}
        isOpen={isEndJourneyModalOpen}
        onRestart={handleResetTrip}
        onClose={() => setIsEndJourneyModalOpen(false)}
      />
    </div>
  );
};

