export type ObjectClass = 'car' | 'pedestrian' | 'cyclist' | 'truck' | 'obstacle' | 'motorcycle' | 'debris';

export type RiskLevel = 'SAFE' | 'CAUTION' | 'CRITICAL';

export interface TrajectoryPoint {
  x: number; // 0..1 or pixel coordinate
  y: number; // 0..1 or pixel coordinate
  timeOffsetSec?: number;
}

export interface TrackedObject {
  id: number | string;
  class: ObjectClass;
  bbox: [number, number, number, number]; // [xmin, ymin, xmax, ymax] either normalized [0..1] or pixel coords
  confidence: number;
  distance: number; // in meters
  relativeVelocity: number; // in m/s (positive = approaching)
  ttc: number; // time-to-collision in seconds (Infinity if safe)
  riskLevel: RiskLevel;
  trajectory?: TrajectoryPoint[];
  position3D?: {
    x: number; // lateral distance (meters)
    y: number; // vertical ground
    z: number; // longitudinal distance (meters)
  };
  color?: string;
}

export interface TTCAlert {
  level: RiskLevel;
  ttcSeconds: number;
  targetId: number | string | null;
  targetClass: string | null;
  distanceMeters: number | null;
  message: string;
}

export interface AVDecision {
  id: string;
  timestamp: number | string;
  action: 'Maintain' | 'Brake' | 'Swerve' | 'Emergency Braking' | 'Lane Change Left' | 'Lane Change Right' | string;
  confidence: number; // 0..1
  targetSpeedKmh: number;
  reasoning: Record<string, string>; // Counterfactual hypotheses e.g. { Maintain: "...", Brake: "...", Swerve: "..." }
  primaryReason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  selectedTrajectory?: TrajectoryPoint[];
}

export interface SensorStatusMap {
  camera: 'HEALTHY' | 'DEGRADED' | 'FAULT';
  lidar: 'HEALTHY' | 'DEGRADED' | 'FAULT';
  radar: 'HEALTHY' | 'DEGRADED' | 'FAULT';
  imu: 'HEALTHY' | 'DEGRADED' | 'FAULT';
  gnss: 'HEALTHY' | 'DEGRADED' | 'FAULT';
}

export type SensorTrend = 'RISING' | 'FALLING' | 'STABLE';
export type SensorHealth = 'ONLINE' | 'STALE' | 'DEGRADED' | 'FAULT';

export interface SensorConfidenceItem {
  confidence: number; // 0.0 to 1.0
  confidencePct: number; // 0 to 100%
  trend: SensorTrend;
  reason: string;
  health: SensorHealth;
}

export interface SensorConfidenceMap {
  camera: SensorConfidenceItem;
  lidar: SensorConfidenceItem;
  radar: SensorConfidenceItem;
  imu: SensorConfidenceItem;
  gnss: SensorConfidenceItem;
}

export interface SensorConfidenceHistoryPoint {
  timestamp: number;
  camera: number;
  lidar: number;
  radar: number;
  imu: number;
  gnss: number;
}

export interface SensorEventMarker {
  id: string;
  timestamp: number;
  timeLabel: string;
  event: string;
  reason: string;
  severity: 'INFO' | 'CAUTION' | 'WARNING' | 'CRITICAL';
}

export interface SensorArbitration {
  dominant_sensor: string;
  is_degraded_arbitration: boolean;
  weights: {
    camera: number;
    lidar: number;
    radar: number;
  };
  override_reason: string;
}

export interface SensorConfidenceData {
  current: SensorConfidenceMap;
  history: SensorConfidenceHistoryPoint[];
  events: SensorEventMarker[];
  arbitration?: SensorArbitration;
}

export interface VehicleMetrics {
  speedKmh: number;
  speedMph: number;
  targetSpeedKmh: number;
  steeringAngleDeg: number; // -45 to +45 deg
  accelerationG: number; // -1.0 to +1.0 G
  lateralG: number;
  brakePressurePct: number; // 0 to 100%
  throttlePct: number; // 0 to 100%
  gear: 'P' | 'R' | 'N' | 'D';
  driveMode: 'AUTONOMOUS' | 'MANUAL_OVERRIDE' | 'EMERGENCY_STOP';
  batterySoc: number; // 0 to 100%
  sensorStatus: SensorStatusMap;
  distanceToLeadVehicle: number; // meters
}

export interface TelemetryPacket {
  timestamp: number;
  frameId: number;
  objects: TrackedObject[];
  decision: AVDecision;
  metrics: VehicleMetrics;
  ttcAlert: TTCAlert;
  activeFaults?: string[];
  sensorConfidence?: SensorConfidenceData;
}

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';

export interface WebSocketMetrics {
  status: ConnectionStatus;
  url: string;
  latencyMs: number;
  fps: number;
  reconnectCount: number;
  bytesReceived: number;
  messagesReceived: number;
  lastMessageTime: number;
}

export interface FaultInjectionPayload {
  action: 'inject_fault' | 'clear_faults' | 'emergency_takeover' | 'reset_simulation' | 'set_scenario';
  faultType?: 'cut_in_vehicle' | 'pedestrian_jaywalking' | 'sensor_blindspot' | 'sudden_brake' | 'weather_degradation' | 'lidar_failure' | 'camera_glare' | string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  durationSec?: number;
  params?: Record<string, any>;
  timestamp?: number;
}
