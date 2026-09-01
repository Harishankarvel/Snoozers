import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { MainVideoFeed } from './components/MainVideoFeed';
import { TelemetrySidebar } from './components/TelemetrySidebar';
import { DecisionLog } from './components/DecisionLog';
import { ControlPanel } from './components/ControlPanel';
import { EndJourneyModal } from './components/EndJourneyModal';
import { 
  FaultInjectionPayload, 
  TelemetryPacket, 
  WebSocketMetrics 
} from './types/telemetry';
import { avWebSocketService } from './services/websocketService';
import { mockSimulationEngine } from './services/mockSimulation';

export const App: React.FC = () => {
  // Mode toggle: Default to false (Live Backend Mode ws://localhost:8000)
  const [isMockMode, setIsMockMode] = useState(false);

  // Metrics for dual WebSockets
  const [videoMetrics, setVideoMetrics] = useState<WebSocketMetrics>(avWebSocketService.videoSocket.metrics);
  const [telemetryMetrics, setTelemetryMetrics] = useState<WebSocketMetrics>(avWebSocketService.telemetrySocket.metrics);

  // Throttled telemetry state for UI widgets (20Hz)
  const [currentTelemetry, setCurrentTelemetry] = useState<TelemetryPacket | null>(null);

  // Ref-based zero-latency pipeline for Canvas rendering
  const latestTelemetryRef = useRef<TelemetryPacket | null>(null);
  const latestFrameBlobRef = useRef<Blob | ArrayBuffer | null>(null);

  // Active faults tracker
  const [activeFaults, setActiveFaults] = useState<string[]>([]);

  // End Journey modal state
  const [isEndJourneyModalOpen, setIsEndJourneyModalOpen] = useState(false);

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
      {/* Top Fixed Header */}
      <Header
        videoMetrics={videoMetrics}
        telemetryMetrics={telemetryMetrics}
        isMockMode={isMockMode}
        onToggleMockMode={() => setIsMockMode(!isMockMode)}
        onEmergencyStop={handleEmergencyStop}
        activeFaultsCount={activeFaults.length}
      />

      {/* Main Grid Dashboard */}
      <main className="flex-1 p-3 sm:p-4 max-w-[1920px] w-full mx-auto flex flex-col gap-3 sm:gap-4">
        {/* Top Section: Main Video Feed Canvas & Telemetry Sidebar */}
        <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-stretch">
          {/* Central Live Video & Perception HUD Feed */}
          <MainVideoFeed
            latestTelemetryRef={latestTelemetryRef}
            latestFrameBlobRef={latestFrameBlobRef}
            isMockMode={isMockMode}
          />

          {/* Right Side: Real-Time Telemetry & Dynamics Sidebar */}
          <TelemetrySidebar 
            telemetry={currentTelemetry}
            onEndJourney={handleEndJourney}
            onResetTrip={handleResetTrip}
          />
        </div>

        {/* Bottom Section: Decision Log & Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-stretch">
          {/* Left: Auto-Scrolling Decision Terminal */}
          <DecisionLog latestTelemetry={currentTelemetry} />

          {/* Right: Edge-Case & Fault Injection Panel */}
          <ControlPanel
            onInjectFault={handleInjectFault}
            activeFaults={activeFaults}
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

