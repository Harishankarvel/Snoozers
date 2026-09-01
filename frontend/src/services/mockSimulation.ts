import { AVDecision, FaultInjectionPayload, ObjectClass, TelemetryPacket, TrackedObject, TTCAlert, VehicleMetrics } from '../types/telemetry';

export class MockSimulationEngine {
  private isRunning = false;
  private animFrameId: number | null = null;
  private telemetryIntervalId: any = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private frameCallback: ((data: Blob | ArrayBuffer) => void) | null = null;
  private telemetryCallback: ((packet: TelemetryPacket) => void) | null = null;

  // Simulation State
  private frameCount = 0;
  private egoSpeed = 68.4; // km/h
  private egoSteering = 0.0; // deg
  private targetSpeed = 70.0;
  private brakePressure = 0;
  private throttle = 45;
  private roadOffset = 0;

  // Dynamic Objects
  private objects: Array<{
    id: number;
    class: ObjectClass;
    lane: number; // -1 (left), 0 (ego lane), 1 (right)
    distanceZ: number; // meters ahead
    lateralOffset: number; // normalized
    speedKmh: number;
    baseWidth: number;
    baseHeight: number;
    color: string;
    customBehavior?: string;
  }> = [];

  // Active Fault Injections
  private activeFaults: Map<string, { startTime: number; durationMs: number; params?: any }> = new Map();

  // Sensor Confidence Evolution State
  private smoothedConfidence = {
    camera: 0.98,
    lidar: 0.96,
    radar: 0.95,
    imu: 0.99,
    gnss: 0.94,
  };
  private confidenceHistory: Array<{
    timestamp: number;
    camera: number;
    lidar: number;
    radar: number;
    imu: number;
    gnss: number;
  }> = [];
  private eventMarkers: Array<{
    id: string;
    timestamp: number;
    timeLabel: string;
    event: string;
    reason: string;
    severity: 'INFO' | 'CAUTION' | 'WARNING' | 'CRITICAL';
  }> = [];
  private eventCounter = 0;
  private lastFaultKeys: Set<string> = new Set();

  // Rain / Fog particles
  private rainDrops: Array<{ x: number; y: number; speed: number; length: number }> = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;

    this.initDefaultObjects();
    this.initRain();
  }

  private initDefaultObjects() {
    this.objects = [
      {
        id: 101,
        class: 'car',
        lane: 0,
        distanceZ: 38.0,
        lateralOffset: 0.0,
        speedKmh: 65.0,
        baseWidth: 90,
        baseHeight: 65,
        color: '#00F0FF',
      },
      {
        id: 102,
        class: 'truck',
        lane: 1,
        distanceZ: 55.0,
        lateralOffset: 0.8,
        speedKmh: 52.0,
        baseWidth: 110,
        baseHeight: 90,
        color: '#FFB800',
      },
      {
        id: 103,
        class: 'car',
        lane: -1,
        distanceZ: 25.0,
        lateralOffset: -0.85,
        speedKmh: 76.0,
        baseWidth: 85,
        baseHeight: 60,
        color: '#A855F7',
      },
    ];
  }

  private initRain() {
    this.rainDrops = [];
    for (let i = 0; i < 200; i++) {
      this.rainDrops.push({
        x: Math.random() * 1280,
        y: Math.random() * 720,
        speed: 15 + Math.random() * 25,
        length: 10 + Math.random() * 20,
      });
    }
  }

  public setCallbacks(
    frameCb: (data: Blob | ArrayBuffer) => void,
    telemetryCb: (packet: TelemetryPacket) => void
  ) {
    this.frameCallback = frameCb;
    this.telemetryCallback = telemetryCb;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.loop();
    
    // Telemetry tick at 20Hz (every 50ms)
    this.telemetryIntervalId = setInterval(() => {
      this.tickTelemetry();
    }, 50);
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.telemetryIntervalId) {
      clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
  }

  public injectFault(payload: FaultInjectionPayload) {
    const faultType = payload.faultType || payload.action;
    const durationMs = (payload.durationSec || 8) * 1000;

    if (payload.action === 'clear_faults' || payload.action === 'reset_simulation') {
      this.activeFaults.clear();
      this.initDefaultObjects();
      this.egoSpeed = 68.4;
      this.targetSpeed = 70.0;
      this.brakePressure = 0;
      return;
    }

    if (payload.action === 'emergency_takeover') {
      this.activeFaults.set('manual_override', {
        startTime: Date.now(),
        durationMs: 15000,
        params: payload.params,
      });
      return;
    }

    if (faultType === 'cut_in_vehicle') {
      // Spawn an aggressive vehicle cutting into ego lane
      this.objects.unshift({
        id: 999,
        class: 'car',
        lane: 0,
        distanceZ: 14.5, // Dangerous close distance
        lateralOffset: 0.15,
        speedKmh: 42.0, // Slower than ego
        baseWidth: 100,
        baseHeight: 70,
        color: '#FF2A6D',
        customBehavior: 'cut_in',
      });
    } else if (faultType === 'pedestrian_jaywalking') {
      // Spawn crossing pedestrian
      this.objects.push({
        id: 777,
        class: 'pedestrian',
        lane: 0,
        distanceZ: 22.0,
        lateralOffset: -1.2, // Walking from left to center
        speedKmh: 6.0,
        baseWidth: 35,
        baseHeight: 75,
        color: '#FF2A6D',
        customBehavior: 'jaywalk',
      });
    } else if (faultType === 'sudden_brake') {
      // Lead vehicle slams brake
      const leadCar = this.objects.find((o) => o.lane === 0 && o.class === 'car');
      if (leadCar) {
        leadCar.speedKmh = 18.0;
        leadCar.distanceZ = Math.min(leadCar.distanceZ, 20.0);
      }
    }

    this.activeFaults.set(faultType, {
      startTime: Date.now(),
      durationMs,
      params: payload.params,
    });
  }

  private lastFrameTime = performance.now();

  private loop = () => {
    if (!this.isRunning) return;

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.updatePhysics(dt);
    this.renderFrame();

    // Export frame as binary JPEG blob to simulate camera byte stream
    this.canvas.toBlob(
      (blob) => {
        if (blob && this.frameCallback) {
          this.frameCallback(blob);
        }
      },
      'image/jpeg',
      0.82
    );

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private updatePhysics(dt: number) {
    this.frameCount++;
    const now = Date.now();

    // Check expired faults
    for (const [fault, data] of this.activeFaults.entries()) {
      if (now - data.startTime > data.durationMs) {
        this.activeFaults.delete(fault);
      }
    }

    const hasWeather = this.activeFaults.has('weather_degradation');
    const hasEmergency = this.activeFaults.has('manual_override');

    // Update Objects
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];

      // Relative speed in m/s
      const relSpeedMps = ((this.egoSpeed - obj.speedKmh) * 1000) / 3600;
      obj.distanceZ -= relSpeedMps * dt;

      // Special behaviors
      if (obj.customBehavior === 'cut_in') {
        if (obj.lateralOffset > 0.0) {
          obj.lateralOffset -= 0.6 * dt;
        }
      } else if (obj.customBehavior === 'jaywalk') {
        obj.lateralOffset += 0.8 * dt; // crosses road
      }

      // Reset far away objects
      if (obj.distanceZ < 4.0 || obj.distanceZ > 120.0) {
        if (obj.id >= 700) {
          // Remove injected temporary objects
          this.objects.splice(i, 1);
          continue;
        } else {
          obj.distanceZ = 80 + Math.random() * 30;
          obj.speedKmh = 55 + Math.random() * 25;
        }
      }
    }

    // Lead vehicle distance
    const leadCar = this.objects.find((o) => o.lane === 0 && o.distanceZ > 0);
    const leadDist = leadCar ? leadCar.distanceZ : 999;

    // Autonomous Speed & Brake Controller
    if (hasEmergency) {
      this.targetSpeed = 0;
      this.brakePressure = 85;
      this.egoSpeed = Math.max(0, this.egoSpeed - 35 * dt);
    } else if (leadDist < 18.0) {
      // Auto-brake
      this.targetSpeed = Math.max(20, (leadCar?.speedKmh || 40) - 10);
      this.brakePressure = Math.min(100, Math.round((20 - leadDist) * 12));
      this.throttle = 0;
      this.egoSpeed = Math.max(this.targetSpeed, this.egoSpeed - 22 * dt);
    } else {
      this.brakePressure = 0;
      this.targetSpeed = hasWeather ? 55.0 : 72.0;
      this.throttle = 50;
      if (this.egoSpeed < this.targetSpeed) {
        this.egoSpeed = Math.min(this.targetSpeed, this.egoSpeed + 8 * dt);
      } else if (this.egoSpeed > this.targetSpeed) {
        this.egoSpeed = Math.max(this.targetSpeed, this.egoSpeed - 6 * dt);
      }
    }

    // Steering slight natural micro-oscillation
    this.egoSteering = Math.sin(this.frameCount * 0.03) * 1.2;
    this.roadOffset += (this.egoSpeed * 1000 / 3600) * dt * 8;
  }

  private renderFrame() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const horizon = h * 0.46;
    const cx = w * 0.5;

    const hasBlindspot = this.activeFaults.has('sensor_blindspot');
    const hasWeather = this.activeFaults.has('weather_degradation');
    const hasLidarFail = this.activeFaults.has('lidar_failure');

    // 1. Sky & Atmosphere (Dark Cyber Night Horizon)
    const skyGradient = ctx.createLinearGradient(0, 0, 0, horizon);
    skyGradient.addColorStop(0, '#04070D');
    skyGradient.addColorStop(0.7, '#08101E');
    skyGradient.addColorStop(1, '#0C1B2E');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, horizon);

    // Distant city skyline silhouette & neon lights
    ctx.fillStyle = '#060B14';
    for (let bx = 0; bx < w; bx += 32) {
      const bh = 20 + Math.sin(bx * 0.1) * 18 + Math.cos(bx * 0.05) * 15;
      ctx.fillRect(bx, horizon - bh, 28, bh);
      // Cyber window dots
      if (bx % 64 === 0) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.fillRect(bx + 6, horizon - bh + 6, 3, 3);
        ctx.fillStyle = '#060B14';
      }
    }

    // 2. Ground & Asphalt
    const groundGradient = ctx.createLinearGradient(0, horizon, 0, h);
    groundGradient.addColorStop(0, '#090E17');
    groundGradient.addColorStop(0.4, '#0D1420');
    groundGradient.addColorStop(1, '#05070B');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, horizon, w, h - horizon);

    // 3. Perspective Highway Road Surface
    ctx.beginPath();
    ctx.moveTo(cx - 70, horizon);
    ctx.lineTo(cx + 70, horizon);
    ctx.lineTo(w + 350, h);
    ctx.lineTo(-350, h);
    ctx.closePath();
    ctx.fillStyle = '#111827';
    ctx.fill();

    // Road Edge Curbs (Glowing Cyber Markings)
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00F0FF33';
    ctx.beginPath();
    ctx.moveTo(cx - 70, horizon);
    ctx.lineTo(-350, h);
    ctx.moveTo(cx + 70, horizon);
    ctx.lineTo(w + 350, h);
    ctx.stroke();

    // Outer Neon Guardrails
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00F0FF88';
    ctx.beginPath();
    ctx.moveTo(cx - 60, horizon);
    ctx.lineTo(-200, h);
    ctx.moveTo(cx + 60, horizon);
    ctx.lineTo(w + 200, h);
    ctx.stroke();

    // 4. Moving Lane Markings
    const laneLines = [-0.35, 0.35]; // relative lane dividers
    laneLines.forEach((laneX) => {
      ctx.strokeStyle = '#FACC15'; // Amber road dash
      ctx.lineWidth = 3;
      const numSegments = 16;
      for (let s = 0; s < numSegments; s++) {
        const segProgress = (s / numSegments + (this.roadOffset % 100) / 100) % 1;
        // Non-linear depth projection
        const p = Math.pow(segProgress, 2.2);
        const nextP = Math.pow(Math.min(1, segProgress + 0.035), 2.2);

        const y1 = horizon + p * (h - horizon);
        const y2 = horizon + nextP * (h - horizon);

        const spread1 = (y1 - horizon) / (h - horizon);
        const spread2 = (y2 - horizon) / (h - horizon);

        const x1 = cx + (laneX * 80) + laneX * 480 * spread1;
        const x2 = cx + (laneX * 80) + laneX * 480 * spread2;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    });

    // 5. Draw 3D Vehicles and Pedestrians on Canvas Road
    // Sort by distance (furthest first)
    const sortedObjs = [...this.objects].sort((a, b) => b.distanceZ - a.distanceZ);

    sortedObjs.forEach((obj) => {
      // Perspective scale factor
      const scale = Math.max(0.08, Math.min(1.4, 28 / (obj.distanceZ + 5)));
      const yScreen = horizon + (h - horizon) * Math.pow(Math.max(0.02, 1 - obj.distanceZ / 100), 1.8);
      const laneSpread = (yScreen - horizon) / (h - horizon);
      const xScreen = cx + (obj.lane * 140 + obj.lateralOffset * 100) * laneSpread * 2.2;

      const ow = obj.baseWidth * scale;
      const oh = obj.baseHeight * scale;

      ctx.save();
      ctx.translate(xScreen, yScreen);

      if (obj.class === 'car' || obj.class === 'truck') {
        // Vehicle Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.ellipse(0, 0, ow * 0.6, oh * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Vehicle Body
        ctx.fillStyle = obj.color;
        ctx.fillRect(-ow / 2, -oh, ow, oh * 0.75);

        // Cabin / Windshield
        ctx.fillStyle = '#050B14';
        ctx.fillRect(-ow * 0.38, -oh * 0.95, ow * 0.76, oh * 0.35);

        // Glowing Taillights (Red)
        ctx.fillStyle = '#FF2A6D';
        ctx.shadowColor = '#FF2A6D';
        ctx.shadowBlur = 10;
        ctx.fillRect(-ow * 0.45, -oh * 0.45, ow * 0.22, oh * 0.18);
        ctx.fillRect(ow * 0.23, -oh * 0.45, ow * 0.22, oh * 0.18);

        // License Plate glow
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-ow * 0.12, -oh * 0.3, ow * 0.24, oh * 0.1);
      } else if (obj.class === 'pedestrian') {
        // Pedestrian Stick / Silhouette
        ctx.fillStyle = '#FFB800';
        ctx.shadowColor = '#FFB800';
        ctx.shadowBlur = 8;
        // Head
        ctx.beginPath();
        ctx.arc(0, -oh * 0.85, ow * 0.35, 0, Math.PI * 2);
        ctx.fill();
        // Torso & Limbs
        ctx.fillRect(-ow * 0.25, -oh * 0.65, ow * 0.5, oh * 0.4);
        ctx.fillRect(-ow * 0.2, -oh * 0.25, ow * 0.15, oh * 0.25);
        ctx.fillRect(ow * 0.05, -oh * 0.25, ow * 0.15, oh * 0.25);
      }

      ctx.restore();
    });

    // 6. Ego Vehicle Dashcam Hood Inset
    ctx.fillStyle = '#060B12';
    ctx.beginPath();
    ctx.moveTo(cx - 320, h);
    ctx.lineTo(cx - 160, h - 35);
    ctx.lineTo(cx + 160, h - 35);
    ctx.lineTo(cx + 320, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#00F0FF44';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 7. Weather & Degradation Effects (Rain / Fog / Blindspot)
    if (hasWeather) {
      // Fog overlay
      ctx.fillStyle = 'rgba(25, 40, 60, 0.45)';
      ctx.fillRect(0, 0, w, h);

      // Rain Streaks
      ctx.strokeStyle = 'rgba(200, 225, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const drop of this.rainDrops) {
        drop.y += drop.speed;
        drop.x -= drop.speed * 0.2;
        if (drop.y > h) {
          drop.y = -10;
          drop.x = Math.random() * w;
        }
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 3, drop.y + drop.length);
      }
      ctx.stroke();
    }

    if (hasBlindspot) {
      // Sensor blindspot glitch artifact on right side
      ctx.fillStyle = 'rgba(255, 0, 50, 0.25)';
      ctx.fillRect(w * 0.6, 0, w * 0.4, h);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      for (let gy = 0; gy < h; gy += 12) {
        if (Math.random() > 0.4) {
          ctx.fillRect(w * 0.6, gy, w * 0.4, 6);
        }
      }
      ctx.fillStyle = '#FF2A6D';
      ctx.font = 'bold 18px JetBrains Mono, monospace';
      ctx.fillText('[SENSOR OCCLUDED - LIDAR / CAM R-SECTOR]', w * 0.62, 50);
    }

    // Camera Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }
  }

  private tickTelemetry() {
    if (!this.telemetryCallback) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const horizon = h * 0.46;
    const cx = w * 0.5;

    const trackedObjects: TrackedObject[] = [];
    let minTtc = Infinity;
    let mostCriticalObj: TrackedObject | null = null;

    this.objects.forEach((obj) => {
      // Perspective projection to screen coords
      const scale = Math.max(0.08, Math.min(1.4, 28 / (obj.distanceZ + 5)));
      const yScreen = horizon + (h - horizon) * Math.pow(Math.max(0.02, 1 - obj.distanceZ / 100), 1.8);
      const laneSpread = (yScreen - horizon) / (h - horizon);
      const xScreen = cx + (obj.lane * 140 + obj.lateralOffset * 100) * laneSpread * 2.2;

      const ow = obj.baseWidth * scale;
      const oh = obj.baseHeight * scale;

      const xmin = Math.max(0, xScreen - ow / 2);
      const ymin = Math.max(0, yScreen - oh);
      const xmax = Math.min(w, xScreen + ow / 2);
      const ymax = Math.min(h, yScreen);

      // Relative velocity in m/s (approaching is positive)
      const relVelocityMps = ((this.egoSpeed - obj.speedKmh) * 1000) / 3600;
      
      // Calculate TTC = distance / relVelocity
      let ttc = Infinity;
      if (relVelocityMps > 0.5 && obj.distanceZ > 0) {
        ttc = obj.distanceZ / relVelocityMps;
      }

      let riskLevel: 'SAFE' | 'CAUTION' | 'CRITICAL' = 'SAFE';
      if (ttc < 2.5 || (obj.lane === 0 && obj.distanceZ < 18)) {
        riskLevel = 'CRITICAL';
      } else if (ttc < 4.5 || (obj.lane === 0 && obj.distanceZ < 30)) {
        riskLevel = 'CAUTION';
      }

      // Predicted trajectory points (3 forward timesteps)
      const trajectory = [
        { x: xScreen, y: yScreen, timeOffsetSec: 0 },
        { x: xScreen + (obj.lane === 0 ? 0 : obj.lane * 8), y: yScreen - 25, timeOffsetSec: 0.5 },
        { x: xScreen + (obj.lane === 0 ? 0 : obj.lane * 16), y: yScreen - 50, timeOffsetSec: 1.0 },
      ];

      const tracked: TrackedObject = {
        id: obj.id,
        class: obj.class,
        bbox: [Math.round(xmin), Math.round(ymin), Math.round(xmax), Math.round(ymax)],
        confidence: 0.94 + Math.sin(this.frameCount + obj.id) * 0.05,
        distance: Math.round(obj.distanceZ * 10) / 10,
        relativeVelocity: Math.round(relVelocityMps * 10) / 10,
        ttc: ttc === Infinity ? 99.9 : Math.round(ttc * 10) / 10,
        riskLevel,
        trajectory,
        position3D: {
          x: Math.round((obj.lane * 3.5 + obj.lateralOffset * 2.0) * 10) / 10,
          y: 0.0,
          z: Math.round(obj.distanceZ * 10) / 10,
        },
        color: obj.color,
      };

      trackedObjects.push(tracked);

      if (ttc < minTtc && obj.lane === 0) {
        minTtc = ttc;
        mostCriticalObj = tracked;
      }
    });

    // Compute Temporal Sensor Confidence Evolution
    const now = Date.now();
    const currentFaults = new Set(this.activeFaults.keys());

    // Register event markers on fault transition
    currentFaults.forEach((fault) => {
      if (!this.lastFaultKeys.has(fault)) {
        this.eventCounter++;
        this.eventMarkers.push({
          id: `mock-evt-${this.eventCounter}`,
          timestamp: now,
          timeLabel: new Date().toISOString().split('T')[1].slice(0, 10),
          event: `${fault.toUpperCase().replace(/_/g, ' ')} STARTED`,
          reason: `Fault condition '${fault}' active in mock simulation`,
          severity: fault.includes('failure') || fault.includes('override') ? 'WARNING' : 'CAUTION',
        });
        if (this.eventMarkers.length > 20) this.eventMarkers.shift();
      }
    });

    this.lastFaultKeys.forEach((fault) => {
      if (!currentFaults.has(fault)) {
        this.eventCounter++;
        this.eventMarkers.push({
          id: `mock-evt-${this.eventCounter}`,
          timestamp: now,
          timeLabel: new Date().toISOString().split('T')[1].slice(0, 10),
          event: `${fault.toUpperCase().replace(/_/g, ' ')} RESOLVED`,
          reason: `Condition '${fault}' cleared, sensors recovering`,
          severity: 'INFO',
        });
        if (this.eventMarkers.length > 20) this.eventMarkers.shift();
      }
    });

    this.lastFaultKeys = currentFaults;

    // Compute raw confidence targets
    const hasWeather = this.activeFaults.has('weather_degradation');
    const hasBlindspot = this.activeFaults.has('sensor_blindspot');
    const hasLidarFail = this.activeFaults.has('lidar_failure');
    const hasGlare = this.activeFaults.has('camera_glare');
    const hasGnssDrop = this.activeFaults.has('gnss_dropout');

    const rawTargets: Record<string, { raw: number; reason: string; health: 'ONLINE' | 'STALE' | 'DEGRADED' | 'FAULT' }> = {
      camera: {
        raw: hasWeather ? 0.38 : hasGlare ? 0.28 : hasBlindspot ? 0.32 : 0.98,
        reason: hasWeather ? 'SEVERE_FOG' : hasGlare ? 'DIRECT_SUN_GLARE' : hasBlindspot ? 'SECTOR_OCCLUSION' : 'NOMINAL_CLEAR',
        health: hasWeather || hasGlare || hasBlindspot ? 'DEGRADED' : 'ONLINE',
      },
      lidar: {
        raw: hasLidarFail ? 0.05 : hasWeather ? 0.65 : hasBlindspot ? 0.40 : 0.96,
        reason: hasLidarFail ? 'LASER_EMITTER_TIMEOUT' : hasWeather ? 'BACKSCATTER_NOISE' : hasBlindspot ? 'SECTOR_OCCLUSION' : 'NOMINAL_CLEAR',
        health: hasLidarFail ? 'FAULT' : hasWeather || hasBlindspot ? 'DEGRADED' : 'ONLINE',
      },
      radar: {
        raw: hasWeather ? 0.98 : 0.95,
        reason: hasWeather ? 'PENETRATES_FOG' : 'NOMINAL_CLEAR',
        health: 'ONLINE',
      },
      imu: {
        raw: 0.99,
        reason: 'NOMINAL_CLEAR',
        health: 'ONLINE',
      },
      gnss: {
        raw: hasGnssDrop ? 0.15 : hasWeather ? 0.90 : 0.94,
        reason: hasGnssDrop ? 'MULTIPATH_SATELLITE_LOCK_LOST' : hasWeather ? 'ATMOSPHERIC_ATTENUATION' : 'NOMINAL_CLEAR',
        health: hasGnssDrop ? 'DEGRADED' : 'ONLINE',
      },
    };

    // Apply EMA smoothing
    const emaAlpha = 0.20;
    const currentConfidenceMap: any = {};
    const trends: Record<string, 'RISING' | 'FALLING' | 'STABLE'> = {};

    (['camera', 'lidar', 'radar', 'imu', 'gnss'] as const).forEach((sensor) => {
      const prev = (this.smoothedConfidence as any)[sensor];
      const target = rawTargets[sensor].raw;
      const smoothed = Math.max(0, Math.min(1, emaAlpha * target + (1 - emaAlpha) * prev));
      (this.smoothedConfidence as any)[sensor] = smoothed;

      const delta = smoothed - prev;
      trends[sensor] = delta > 0.005 ? 'RISING' : delta < -0.005 ? 'FALLING' : 'STABLE';

      currentConfidenceMap[sensor] = {
        confidence: Math.round(smoothed * 1000) / 1000,
        confidencePct: Math.round(smoothed * 1000) / 10,
        trend: trends[sensor],
        reason: rawTargets[sensor].reason,
        health: rawTargets[sensor].health,
      };
    });

    // Append to 15s history buffer
    this.confidenceHistory.push({
      timestamp: now,
      camera: currentConfidenceMap.camera.confidence,
      lidar: currentConfidenceMap.lidar.confidence,
      radar: currentConfidenceMap.radar.confidence,
      imu: currentConfidenceMap.imu.confidence,
      gnss: currentConfidenceMap.gnss.confidence,
    });

    if (this.confidenceHistory.length > 350) {
      this.confidenceHistory.shift();
    }

    // Arbitration check
    const isRadarPreferred =
      (currentConfidenceMap.camera.confidence < 0.60 || currentConfidenceMap.lidar.confidence < 0.60) &&
      currentConfidenceMap.radar.confidence > 0.85;

    const arbitration = {
      dominant_sensor: isRadarPreferred ? 'RADAR' : 'FUSED_NOMINAL',
      is_degraded_arbitration: isRadarPreferred,
      weights: {
        camera: Math.round((currentConfidenceMap.camera.confidence / (currentConfidenceMap.camera.confidence + currentConfidenceMap.lidar.confidence + currentConfidenceMap.radar.confidence)) * 100) / 100,
        lidar: Math.round((currentConfidenceMap.lidar.confidence / (currentConfidenceMap.camera.confidence + currentConfidenceMap.lidar.confidence + currentConfidenceMap.radar.confidence)) * 100) / 100,
        radar: Math.round((currentConfidenceMap.radar.confidence / (currentConfidenceMap.camera.confidence + currentConfidenceMap.lidar.confidence + currentConfidenceMap.radar.confidence)) * 100) / 100,
      },
      override_reason: isRadarPreferred
        ? `RADAR arbitrated over CAM/LiDAR (RADAR: ${currentConfidenceMap.radar.confidencePct}%, CAM: ${currentConfidenceMap.camera.confidencePct}% [${currentConfidenceMap.camera.reason}])`
        : 'Nominal multi-sensor optical/RF consensus',
    };

    const arbitrationText = isRadarPreferred ? ` [Sensor Arbitration: ${arbitration.override_reason}]` : '';

    // Multi-Hypothesis AV Decision
    let selectedAction: string = 'Maintain';
    let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const reasoning: Record<string, string> = {};

    const hasEmergencyFault = this.activeFaults.has('manual_override');

    const leadCar = trackedObjects.find((o) => Math.abs(o.position3D?.x || 0) < 1.8 && (o.position3D?.z || 99) < 25);
    const leftLaneOccupied = trackedObjects.some((o) => (o.position3D?.x || 0) < -1.5 && (o.position3D?.z || 99) < 25);
    const rightLaneOccupied = trackedObjects.some((o) => (o.position3D?.x || 0) > 1.5 && (o.position3D?.z || 99) < 25);

    if (hasEmergencyFault) {
      selectedAction = 'Emergency Braking';
      urgency = 'critical';
      reasoning['Maintain'] = 'REJECTED: Operator takeover override engaged.';
      reasoning['Brake'] = 'ACCEPTED: Maximum braking pressure commanded.';
      reasoning['Swerve'] = 'REJECTED: Manual control priority.';
    } else if (leadCar && (leadCar.ttc < 2.2 || leadCar.distance < 16)) {
      // Dangerous imminent collision
      urgency = 'critical';
      reasoning['Maintain'] = `REJECTED: Imminent collision with Object #${leadCar.id} (${leadCar.class}) in ${leadCar.ttc.toFixed(1)}s.${arbitrationText}`;

      if (!leftLaneOccupied && leadCar.ttc < 1.5) {
        selectedAction = 'Swerve';
        reasoning['Brake'] = 'INSUFFICIENT: Stopping distance exceeds headway buffer.';
        reasoning['Swerve'] = `OPTIMAL: Left evasive maneuver path verified clear (TTC > 6.0s).${arbitrationText}`;
      } else {
        selectedAction = 'Emergency Braking';
        reasoning['Brake'] = `OPTIMAL: Full ABS braking engaged (-8.2 m/s²).${arbitrationText}`;
        reasoning['Swerve'] = `REJECTED: Adjacent lanes occupied (Left: ${leftLaneOccupied ? 'BLOCKED' : 'CLEAR'}, Right: ${rightLaneOccupied ? 'BLOCKED' : 'CLEAR'}).`;
      }
    } else if (leadCar && leadCar.distance < 28) {
      // Moderate caution
      selectedAction = 'Brake';
      urgency = 'medium';
      reasoning['Maintain'] = `CAUTION: Approaching lead vehicle #${leadCar.id} (${leadCar.distance.toFixed(1)}m).${arbitrationText}`;
      reasoning['Brake'] = `OPTIMAL: Smooth regenerative deceleration to maintain 2.5s headway.${arbitrationText}`;
      reasoning['Swerve'] = 'STANDBY: Lane maintenance preferred over premature swerve.';
    } else {
      // Safe cruising
      selectedAction = 'Maintain';
      urgency = 'low';
      reasoning['Maintain'] = `OPTIMAL: Forward corridor clear. Cruising at target trajectory.${arbitrationText}`;
      reasoning['Brake'] = 'STANDBY: No hazard detected within forward 60m cone.';
      reasoning['Swerve'] = 'STANDBY: Ego lane optimal for planned navigation route.';
    }

    const decision: AVDecision = {
      id: `dec-${this.frameCount}`,
      timestamp: new Date().toISOString().split('T')[1].slice(0, 12),
      action: selectedAction,
      confidence: Math.round(currentConfidenceMap.camera.confidence * 100) / 100,
      targetSpeedKmh: Math.round(this.targetSpeed),
      reasoning,
      primaryReason: reasoning[selectedAction] || 'Nominal autonomous driving state.',
      urgency,
    };

    const ttcAlert: TTCAlert = {
      level: minTtc < 2.5 ? 'CRITICAL' : minTtc < 4.5 ? 'CAUTION' : 'SAFE',
      ttcSeconds: minTtc === Infinity ? 99.9 : Math.round(minTtc * 10) / 10,
      targetId: mostCriticalObj ? (mostCriticalObj as TrackedObject).id : null,
      targetClass: mostCriticalObj ? (mostCriticalObj as TrackedObject).class : null,
      distanceMeters: mostCriticalObj ? (mostCriticalObj as TrackedObject).distance : null,
      message:
        minTtc < 2.5
          ? `CRITICAL TTC WARNING: Target #${mostCriticalObj?.id} (${mostCriticalObj?.class}) at ${mostCriticalObj?.distance}m!`
          : minTtc < 4.5
          ? `CAUTION: Headway closing on Target #${mostCriticalObj?.id}`
          : 'All collision corridors clear.',
    };

    const vehicleMetrics: VehicleMetrics = {
      speedKmh: Math.round(this.egoSpeed * 10) / 10,
      speedMph: Math.round((this.egoSpeed * 0.621371) * 10) / 10,
      targetSpeedKmh: Math.round(this.targetSpeed),
      steeringAngleDeg: Math.round(this.egoSteering * 10) / 10,
      accelerationG: selectedAction.includes('Brake') ? -0.45 : 0.08,
      lateralG: Math.round((this.egoSteering * 0.02) * 100) / 100,
      brakePressurePct: this.brakePressure,
      throttlePct: this.throttle,
      gear: 'D',
      driveMode: hasEmergencyFault ? 'MANUAL_OVERRIDE' : selectedAction === 'Emergency Braking' ? 'EMERGENCY_STOP' : 'AUTONOMOUS',
      batterySoc: 88,
      distanceToLeadVehicle: leadCar ? leadCar.distance : 99.9,
      sensorStatus: {
        camera: currentConfidenceMap.camera.health === 'DEGRADED' ? 'DEGRADED' : 'HEALTHY',
        lidar: currentConfidenceMap.lidar.health === 'FAULT' ? 'FAULT' : currentConfidenceMap.lidar.health === 'DEGRADED' ? 'DEGRADED' : 'HEALTHY',
        radar: 'HEALTHY',
        imu: 'HEALTHY',
        gnss: currentConfidenceMap.gnss.health === 'DEGRADED' ? 'DEGRADED' : 'HEALTHY',
      },
    };

    const packet: TelemetryPacket = {
      timestamp: Date.now(),
      frameId: this.frameCount,
      objects: trackedObjects,
      decision,
      metrics: vehicleMetrics,
      sensorConfidence: {
        current: currentConfidenceMap,
        history: this.confidenceHistory,
        events: this.eventMarkers,
        arbitration,
      },
      ttcAlert,
      activeFaults: Array.from(this.activeFaults.keys()),
    };

    this.telemetryCallback(packet);
  }
}

export const mockSimulationEngine = new MockSimulationEngine();
