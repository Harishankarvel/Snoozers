import React, { useEffect, useRef, useState } from 'react';
import { 
  Eye, 
  Layers, 
  Compass, 
  Crosshair, 
  Grid, 
  Camera, 
  Maximize, 
  AlertTriangle,
  Radio,
  Sliders
} from 'lucide-react';
import { TelemetryPacket, TrackedObject } from '../types/telemetry';
import { audioManager } from '../utils/audioAlerts';

interface MainVideoFeedProps {
  latestTelemetryRef: React.MutableRefObject<TelemetryPacket | null>;
  latestFrameBlobRef: React.MutableRefObject<Blob | ArrayBuffer | null>;
  isMockMode: boolean;
}

export const MainVideoFeed: React.FC<MainVideoFeedProps> = ({
  latestTelemetryRef,
  latestFrameBlobRef,
  isMockMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Overlay visualization toggles
  const [showBBoxes, setShowBBoxes] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showRadar, setShowRadar] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // Image bitmap caching for zero-leak high-speed video rendering
  const currentBitmapRef = useRef<ImageBitmap | null>(null);
  const isDecodingRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);

  // Sound triggers on state changes
  const prevCriticalIdRef = useRef<number | string | null>(null);

  useEffect(() => {
    let active = true;

    const renderLoop = () => {
      if (!active) return;

      const videoCanvas = videoCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      const telemetry = latestTelemetryRef.current;

      // 1. Process Video Frame Blob if available
      const frameData = latestFrameBlobRef.current;
      if (frameData && !isDecodingRef.current) {
        isDecodingRef.current = true;
        const blob = frameData instanceof Blob ? frameData : new Blob([frameData], { type: 'image/jpeg' });

        createImageBitmap(blob)
          .then((bitmap) => {
            if (currentBitmapRef.current) {
              currentBitmapRef.current.close();
            }
            currentBitmapRef.current = bitmap;
            isDecodingRef.current = false;
          })
          .catch(() => {
            isDecodingRef.current = false;
          });
      }

      // 2. Draw Video Canvas
      if (videoCanvas) {
        const vCtx = videoCanvas.getContext('2d');
        if (vCtx && currentBitmapRef.current) {
          vCtx.drawImage(currentBitmapRef.current, 0, 0, videoCanvas.width, videoCanvas.height);
        } else if (vCtx && !currentBitmapRef.current) {
          // Placeholder standby screen
          vCtx.fillStyle = '#050A14';
          vCtx.fillRect(0, 0, videoCanvas.width, videoCanvas.height);
          vCtx.fillStyle = '#00F0FF33';
          vCtx.font = '16px JetBrains Mono, monospace';
          vCtx.textAlign = 'center';
          vCtx.fillText('WAITING FOR CAMERA BYTE STREAM...', videoCanvas.width / 2, videoCanvas.height / 2);
        }
      }

      // 3. Draw Overlay Canvas
      if (overlayCanvas) {
        const ctx = overlayCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          if (telemetry) {
            drawTelemetryOverlay(ctx, overlayCanvas.width, overlayCanvas.height, telemetry);
          }
        }
      }

      // 4. Check critical alerts for sound effects
      if (telemetry?.ttcAlert?.level === 'CRITICAL') {
        const currentCritId = telemetry.ttcAlert.targetId;
        if (currentCritId !== prevCriticalIdRef.current) {
          prevCriticalIdRef.current = currentCritId;
          audioManager.playCriticalAlert();
        }
      } else {
        prevCriticalIdRef.current = null;
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (currentBitmapRef.current) {
        currentBitmapRef.current.close();
        currentBitmapRef.current = null;
      }
    };
  }, []);

  // Overlay Graphic Drawing Routine
  const drawTelemetryOverlay = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    telemetry: TelemetryPacket
  ) => {
    const horizon = height * 0.46;
    const cx = width * 0.5;

    // A. Draw IPM Perspective Ground Grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;

      // Longitudinal lines
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 25, horizon);
        ctx.lineTo(cx + i * 220, height);
        ctx.stroke();
      }

      // Lateral distance depth rings / lines
      for (let dist = 10; dist <= 60; dist += 10) {
        const p = Math.pow(Math.max(0, 1 - dist / 70), 1.8);
        const yLine = horizon + (height - horizon) * p;
        ctx.beginPath();
        ctx.moveTo(cx - 300 * (1 - p * 0.5), yLine);
        ctx.lineTo(cx + 300 * (1 - p * 0.5), yLine);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`${dist}m`, cx + 310 * (1 - p * 0.5), yLine + 3);
      }
    }

    // B. Draw Ego Vehicle Predicted Trajectory Corridor
    if (showTrajectories) {
      const egoSteering = telemetry.metrics.steeringAngleDeg || 0;
      const isEmergency = telemetry.decision.action.includes('Brake');
      const isSwerve = telemetry.decision.action === 'Swerve';

      const corridorGradient = ctx.createLinearGradient(0, height, 0, horizon);
      if (isEmergency) {
        corridorGradient.addColorStop(0, 'rgba(255, 42, 109, 0.45)');
        corridorGradient.addColorStop(1, 'rgba(255, 42, 109, 0.0)');
      } else if (isSwerve) {
        corridorGradient.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
        corridorGradient.addColorStop(1, 'rgba(168, 85, 247, 0.0)');
      } else {
        corridorGradient.addColorStop(0, 'rgba(0, 245, 155, 0.35)');
        corridorGradient.addColorStop(0.7, 'rgba(0, 240, 255, 0.2)');
        corridorGradient.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      }

      ctx.beginPath();
      const steerOffset = egoSteering * 6.0;
      ctx.moveTo(cx - 140, height);
      ctx.quadraticCurveTo(cx - 60 + steerOffset, horizon + 80, cx - 20 + steerOffset * 1.5, horizon + 10);
      ctx.lineTo(cx + 20 + steerOffset * 1.5, horizon + 10);
      ctx.quadraticCurveTo(cx + 60 + steerOffset, horizon + 80, cx + 140, height);
      ctx.closePath();

      ctx.fillStyle = corridorGradient;
      ctx.fill();

      // Ego Centerline Trajectory Spline
      ctx.strokeStyle = isEmergency ? '#FF2A6D' : isSwerve ? '#A855F7' : '#00F59B';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, height);
      ctx.quadraticCurveTo(cx + steerOffset, horizon + 80, cx + steerOffset * 1.5, horizon + 15);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // C. Draw Detected Object Bounding Boxes & Target Trajectories
    telemetry.objects.forEach((obj) => {
      const [xmin, ymin, xmax, ymax] = obj.bbox;
      const boxW = xmax - xmin;
      const boxH = ymax - ymin;
      const isCritical = obj.riskLevel === 'CRITICAL';
      const isCaution = obj.riskLevel === 'CAUTION';

      const themeColor = isCritical ? '#FF2A6D' : isCaution ? '#FFB800' : '#00F0FF';

      // 1. Draw Object Trajectory Ribbon
      if (showTrajectories && obj.trajectory && obj.trajectory.length > 1) {
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(obj.trajectory[0].x, obj.trajectory[0].y);
        for (let t = 1; t < obj.trajectory.length; t++) {
          ctx.lineTo(obj.trajectory[t].x, obj.trajectory[t].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Trajectory End Target Marker
        const lastPt = obj.trajectory[obj.trajectory.length - 1];
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Draw Cyber Bounding Box with Futuristic Corner Brackets
      if (showBBoxes) {
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = isCritical ? 2.5 : 1.5;

        // Subtle box fill with animated pulsing glow for critical/pedestrians
        const now = Date.now();
        const pulse = isCritical ? 0.12 + Math.sin(now * 0.008) * 0.08 : 0.06;
        ctx.fillStyle = isCritical
          ? `rgba(255, 42, 109, ${pulse})`
          : isCaution
          ? 'rgba(255, 184, 0, 0.1)'
          : 'rgba(0, 240, 255, 0.06)';
        ctx.fillRect(xmin, ymin, boxW, boxH);

        // Corner Brackets
        const cornerLen = Math.min(18, Math.min(boxW, boxH) * 0.35);

        // Top-Left
        ctx.beginPath();
        ctx.moveTo(xmin, ymin + cornerLen);
        ctx.lineTo(xmin, ymin);
        ctx.lineTo(xmin + cornerLen, ymin);
        ctx.stroke();

        // Top-Right
        ctx.beginPath();
        ctx.moveTo(xmax - cornerLen, ymin);
        ctx.lineTo(xmax, ymin);
        ctx.lineTo(xmax, ymin + cornerLen);
        ctx.stroke();

        // Bottom-Left
        ctx.beginPath();
        ctx.moveTo(xmin, ymax - cornerLen);
        ctx.lineTo(xmin, ymax);
        ctx.lineTo(xmin + cornerLen, ymax);
        ctx.stroke();

        // Bottom-Right
        ctx.beginPath();
        ctx.moveTo(xmax - cornerLen, ymax);
        ctx.lineTo(xmax, ymax);
        ctx.lineTo(xmax, ymax - cornerLen);
        ctx.stroke();

        // Center Animated Crosshair Target Lock for Pedestrians / Critical Targets
        if (isCritical || obj.class === 'pedestrian') {
          const midX = xmin + boxW / 2;
          const midY = ymin + boxH / 2;
          const rotAngle = (now * 0.003) % (Math.PI * 2);

          ctx.save();
          ctx.translate(midX, midY);
          ctx.rotate(rotAngle);
          ctx.strokeStyle = '#FF2A6D';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, Math.min(boxW, boxH) * 0.45 + 4, 0, Math.PI * 2);
          ctx.moveTo(-Math.min(boxW, boxH) * 0.6, 0); ctx.lineTo(Math.min(boxW, boxH) * 0.6, 0);
          ctx.moveTo(0, -Math.min(boxW, boxH) * 0.6); ctx.lineTo(0, Math.min(boxW, boxH) * 0.6);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 3. Draw Cyber Identification Tag & Metrics Pill
      if (showTags) {
        const isPed = obj.class === 'pedestrian';
        const tagText = isPed 
          ? `🚶 JAYWALKER #${obj.id} ${(obj.confidence * 100).toFixed(0)}%`
          : `#${obj.id} ${obj.class.toUpperCase()} ${(obj.confidence * 100).toFixed(0)}%`;
        const metricsText = `${obj.distance.toFixed(1)}m | ${obj.ttc > 50 ? 'SAFE' : `${obj.ttc.toFixed(1)}s TTC`}`;

        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const tagW = Math.max(ctx.measureText(tagText).width, ctx.measureText(metricsText).width) + 16;
        const tagH = 32;

        const tagX = Math.min(width - tagW - 8, Math.max(8, xmin));
        const tagY = Math.max(8, ymin - tagH - 4);

        // Tag Background Pill
        ctx.fillStyle = 'rgba(7, 12, 20, 0.9)';
        ctx.fillRect(tagX, tagY, tagW, tagH);

        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(tagX, tagY, tagW, tagH);

        // Left accent strip
        ctx.fillStyle = themeColor;
        ctx.fillRect(tagX, tagY, 3, tagH);

        // Text labels
        ctx.fillStyle = isPed ? '#FF2A6D' : '#F8FAFC';
        ctx.fillText(tagText, tagX + 8, tagY + 13);

        ctx.fillStyle = isCritical ? '#FF2A6D' : isCaution ? '#FFB800' : '#38BDF8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(metricsText, tagX + 8, tagY + 26);
      }

    });

    // D. Top-Right Bird's Eye View (BEV) Mini-Radar Map
    if (showRadar) {
      const radarSize = 140;
      const radarX = width - radarSize - 16;
      const radarY = 16;
      const radarCx = radarX + radarSize / 2;
      const radarCy = radarY + radarSize * 0.82; // Ego at bottom center

      // Radar Container Box
      ctx.fillStyle = 'rgba(6, 11, 20, 0.85)';
      ctx.fillRect(radarX, radarY, radarSize, radarSize);
      ctx.strokeStyle = '#1E2D45';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(radarX, radarY, radarSize, radarSize);

      // Radar Range Rings (20m, 40m, 60m)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.lineWidth = 1;
      [25, 55, 85].forEach((r) => {
        ctx.beginPath();
        ctx.arc(radarCx, radarCy, r, Math.PI, Math.PI * 2);
        ctx.stroke();
      });

      // Radar Angular Sweep Line
      const sweepAngle = (Date.now() % 2000) / 2000 * Math.PI;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(radarCx, radarCy);
      ctx.lineTo(radarCx + Math.cos(Math.PI + sweepAngle) * 90, radarCy + Math.sin(Math.PI + sweepAngle) * 90);
      ctx.stroke();

      // Ego Vehicle Blip at Origin
      ctx.fillStyle = '#00F59B';
      ctx.beginPath();
      ctx.moveTo(radarCx, radarCy - 8);
      ctx.lineTo(radarCx - 5, radarCy + 4);
      ctx.lineTo(radarCx + 5, radarCy + 4);
      ctx.closePath();
      ctx.fill();

      // Surrounding Target Blips
      telemetry.objects.forEach((obj) => {
        const x3d = obj.position3D?.x || 0;
        const z3d = obj.position3D?.z || 10;

        // Map 3D coords to radar pixels (scale: 1.3 px per meter)
        const blipX = radarCx + x3d * 6.5;
        const blipY = radarCy - z3d * 1.35;

        if (blipX >= radarX && blipX <= radarX + radarSize && blipY >= radarY && blipY <= radarY + radarSize) {
          const blipColor = obj.riskLevel === 'CRITICAL' ? '#FF2A6D' : obj.riskLevel === 'CAUTION' ? '#FFB800' : '#00F0FF';
          ctx.fillStyle = blipColor;
          ctx.beginPath();
          ctx.arc(blipX, blipY, obj.riskLevel === 'CRITICAL' ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Radar Title & Range Label
      ctx.fillStyle = '#94A3B8';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText('BEV RADAR (60m)', radarX + 8, radarY + 14);
    }
  };

  const handleSnapshot = () => {
    audioManager.playClick();
    if (!videoCanvasRef.current || !overlayCanvasRef.current) return;

    // Merge video and overlay canvases to an export canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1280;
    exportCanvas.height = 720;
    const expCtx = exportCanvas.getContext('2d');
    if (expCtx) {
      expCtx.drawImage(videoCanvasRef.current, 0, 0, 1280, 720);
      expCtx.drawImage(overlayCanvasRef.current, 0, 0, 1280, 720);

      const link = document.createElement('a');
      link.download = `aura-av-frame-${Date.now()}.png`;
      link.href = exportCanvas.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full bg-[#05080E] rounded-xl border border-[#1A2638] overflow-hidden flex flex-col shadow-[0_0_25px_rgba(0,0,0,0.7)]"
    >
      {/* Video Canvas Container (16:9 Aspect Ratio) */}
      <div className="relative w-full aspect-video bg-black overflow-hidden flex items-center justify-center">
        {/* Base Layer: Raw Camera Video Stream */}
        <canvas
          id="video-feed-canvas"
          ref={videoCanvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-contain"
        />

        {/* Top Layer: Hardware Accelerated Telemetry & Perception HUD */}
        <canvas
          id="telemetry-overlay-canvas"
          ref={overlayCanvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Top-Left HUD Stream Info Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded bg-[#070D18]/80 backdrop-blur-md border border-[#1E2D45] text-xs font-mono">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
          <span className="text-slate-300 font-semibold">CAM-01 [FRONT APERTURE 120°]</span>
          <span className="text-slate-500">|</span>
          <span className="text-cyan-400">1280x720 RAW</span>
        </div>

        {/* Bottom Floating Overlay Control Toolbar */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#070D18]/90 backdrop-blur-md border border-[#1E2D45] shadow-xl z-20">
          <button
            onClick={() => {
              audioManager.playClick();
              setShowBBoxes(!showBBoxes);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all ${
              showBBoxes ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Bounding Boxes"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>BBOX</span>
          </button>

          <button
            onClick={() => {
              audioManager.playClick();
              setShowTrajectories(!showTrajectories);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all ${
              showTrajectories ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Trajectory Predictions"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>TRAJ</span>
          </button>

          <button
            onClick={() => {
              audioManager.playClick();
              setShowTags(!showTags);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all ${
              showTags ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Metric Labels & Distance Tags"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>TAGS</span>
          </button>

          <button
            onClick={() => {
              audioManager.playClick();
              setShowRadar(!showRadar);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all ${
              showRadar ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle BEV Radar Inset"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>BEV RADAR</span>
          </button>

          <button
            onClick={() => {
              audioManager.playClick();
              setShowGrid(!showGrid);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all ${
              showGrid ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle IPM Perspective Grid"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>IPM GRID</span>
          </button>

          <div className="w-px h-4 bg-slate-700 mx-1"></div>

          <button
            onClick={handleSnapshot}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-slate-300 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Export Frame Snapshot"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>CAPTURE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
