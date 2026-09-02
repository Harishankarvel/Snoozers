import React, { useRef, useEffect } from 'react';
import { Camera, Crosshair, Eye, ShieldAlert } from 'lucide-react';

export const HUDView = ({ objects = [], collisionRiskScore = 0.0, isSimulated = false }) => {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const roadOffsetRef = useRef(0);

  // Background animated procedural driving canvas when no raw mp4 stream is piped
  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const renderDashcam = () => {
      if (!active) return;
      const w = canvas.width;
      const h = canvas.height;
      const horizon = h * 0.46;
      const cx = w * 0.5;

      // Increment road offset
      roadOffsetRef.current += 1.8;

      // 1. Sky & Cyber Atmosphere
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
      skyGrad.addColorStop(0, '#04070D');
      skyGrad.addColorStop(0.7, '#08101E');
      skyGrad.addColorStop(1, '#0C1B2E');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizon);

      // Distant city silhouette
      ctx.fillStyle = '#060B14';
      for (let bx = 0; bx < w; bx += 32) {
        const bh = 15 + Math.sin(bx * 0.1) * 14;
        ctx.fillRect(bx, horizon - bh, 28, bh);
      }

      // 2. Asphalt Ground
      const groundGrad = ctx.createLinearGradient(0, horizon, 0, h);
      groundGrad.addColorStop(0, '#090E17');
      groundGrad.addColorStop(0.4, '#0D1420');
      groundGrad.addColorStop(1, '#05070B');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizon, w, h - horizon);

      // 3. Perspective Road
      ctx.beginPath();
      ctx.moveTo(cx - 70, horizon);
      ctx.lineTo(cx + 70, horizon);
      ctx.lineTo(w + 350, h);
      ctx.lineTo(-350, h);
      ctx.closePath();
      ctx.fillStyle = '#111827';
      ctx.fill();

      // Glowing Guardrails
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = collisionRiskScore > 0.6 ? 'rgba(255, 42, 109, 0.6)' : 'rgba(0, 240, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(cx - 70, horizon); ctx.lineTo(-350, h);
      ctx.moveTo(cx + 70, horizon); ctx.lineTo(w + 350, h);
      ctx.stroke();

      // Moving Yellow Lane Dashes
      [-0.35, 0.35].forEach((laneX) => {
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 3;
        for (let s = 0; s < 10; s++) {
          const prog = (s / 10 + (roadOffsetRef.current % 100) / 100) % 1;
          const p1 = Math.pow(prog, 2.2);
          const p2 = Math.pow(Math.min(1, prog + 0.04), 2.2);
          const y1 = horizon + p1 * (h - horizon);
          const y2 = horizon + p2 * (h - horizon);
          const sp1 = (y1 - horizon) / (h - horizon);
          const sp2 = (y2 - horizon) / (h - horizon);

          ctx.beginPath();
          ctx.moveTo(cx + laneX * 80 + laneX * 480 * sp1, y1);
          ctx.lineTo(cx + laneX * 80 + laneX * 480 * sp2, y2);
          ctx.stroke();
        }
      });

      // 4. Ego Vehicle Trajectory Corridor
      const corridorGrad = ctx.createLinearGradient(0, h, 0, horizon);
      if (collisionRiskScore > 0.6) {
        corridorGrad.addColorStop(0, 'rgba(255, 42, 109, 0.35)');
        corridorGrad.addColorStop(1, 'rgba(255, 42, 109, 0.0)');
      } else if (collisionRiskScore >= 0.4) {
        corridorGrad.addColorStop(0, 'rgba(255, 184, 0, 0.25)');
        corridorGrad.addColorStop(1, 'rgba(255, 184, 0, 0.0)');
      } else {
        corridorGrad.addColorStop(0, 'rgba(0, 245, 155, 0.25)');
        corridorGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      }

      ctx.beginPath();
      ctx.moveTo(cx - 130, h);
      ctx.lineTo(cx - 20, horizon + 20);
      ctx.lineTo(cx + 20, horizon + 20);
      ctx.lineTo(cx + 130, h);
      ctx.closePath();
      ctx.fillStyle = corridorGrad;
      ctx.fill();

      // 5. Dashcam Hood Inset
      ctx.fillStyle = '#060B12';
      ctx.beginPath();
      ctx.moveTo(cx - 300, h);
      ctx.lineTo(cx - 150, h - 30);
      ctx.lineTo(cx + 150, h - 30);
      ctx.lineTo(cx + 300, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#00F0FF33';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(renderDashcam);
    };

    animFrameRef.current = requestAnimationFrame(renderDashcam);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [collisionRiskScore]);

  // Determine Bounding Box stroke and glow colors based on collision risk and object class
  const getObjectTheme = (obj) => {
    if (collisionRiskScore > 0.6) {
      return { stroke: '#FF2A6D', fill: 'rgba(255, 42, 109, 0.18)', tagBg: '#FF2A6D', text: '#FFFFFF' };
    }
    if (collisionRiskScore >= 0.4 || obj.class === 'Pedestrian' || obj.class === 'Cyclist') {
      return { stroke: '#FFB800', fill: 'rgba(255, 184, 0, 0.12)', tagBg: '#FFB800', text: '#050B14' };
    }
    return { stroke: '#00F0FF', fill: 'rgba(0, 240, 255, 0.08)', tagBg: '#00F0FF', text: '#050B14' };
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl border border-[#1A2638] overflow-hidden shadow-2xl flex items-center justify-center">
      {/* Background Canvas: Forward Camera Viewport */}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* SVG Layer: Real-Time 2D Bounding Boxes & Perception Labels */}
      <svg
        viewBox="0 0 1280 720"
        className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
      >
        {/* HUD Crosshairs in center */}
        <g opacity="0.35">
          <line x1="620" y1="360" x2="660" y2="360" stroke="#00F0FF" strokeWidth="1.5" />
          <line x1="640" y1="340" x2="640" y2="380" stroke="#00F0FF" strokeWidth="1.5" />
          <circle cx="640" cy="360" r="16" fill="none" stroke="#00F0FF" strokeWidth="1" strokeDasharray="3 3" />
        </g>

        {/* Dynamic Object Bounding Boxes */}
        {objects.map((obj, idx) => {
          if (!obj.bbox_2d || obj.bbox_2d.length < 4) return null;
          const [xmin, ymin, xmax, ymax] = obj.bbox_2d;
          const bw = Math.max(10, xmax - xmin);
          const bh = Math.max(10, ymax - ymin);
          const theme = getObjectTheme(obj);
          const cLen = Math.min(16, bw * 0.35, bh * 0.35);

          const confPercentage = Math.round((obj.confidence || 0.85) * 100);
          const labelText = `${obj.class.toUpperCase()} ${confPercentage}%`;

          return (
            <g key={`bbox-${idx}-${obj.class}`}>
              {/* Bounding box fill */}
              <rect
                x={xmin}
                y={ymin}
                width={bw}
                height={bh}
                fill={theme.fill}
                stroke={theme.stroke}
                strokeWidth={collisionRiskScore > 0.6 ? '2.5' : '1.5'}
              />

              {/* Futuristic Corner Brackets */}
              <path
                d={`
                  M ${xmin} ${ymin + cLen} L ${xmin} ${ymin} L ${xmin + cLen} ${ymin}
                  M ${xmax - cLen} ${ymin} L ${xmax} ${ymin} L ${xmax} ${ymin + cLen}
                  M ${xmin} ${ymax - cLen} L ${xmin} ${ymax} L ${xmin + cLen} ${ymax}
                  M ${xmax - cLen} ${ymax} L ${xmax} ${ymax} L ${xmax} ${ymax - cLen}
                `}
                fill="none"
                stroke={theme.stroke}
                strokeWidth="2.5"
              />

              {/* Collision Reticle for Imminent Risk */}
              {collisionRiskScore > 0.6 && (
                <g transform={`translate(${xmin + bw / 2}, ${ymin + bh / 2})`}>
                  <circle r="12" fill="none" stroke="#FF2A6D" strokeWidth="1.5" strokeDasharray="4 2" />
                  <line x1="-16" y1="0" x2="16" y2="0" stroke="#FF2A6D" strokeWidth="1" />
                  <line x1="0" y1="-16" x2="0" y2="16" stroke="#FF2A6D" strokeWidth="1" />
                </g>
              )}

              {/* Tag Label Badge */}
              <g transform={`translate(${xmin}, ${Math.max(18, ymin - 8)})`}>
                <rect
                  x="0"
                  y="-14"
                  width={labelText.length * 7.5 + 12}
                  height="16"
                  rx="3"
                  fill={theme.tagBg}
                />
                <text
                  x="6"
                  y="-2"
                  fill={theme.text}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {labelText}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Top Left Camera Status HUD */}
      <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded bg-[#070D18]/85 backdrop-blur-md border border-[#1E2D45] text-xs font-mono z-20">
        <span className={`w-2 h-2 rounded-full ${collisionRiskScore > 0.6 ? 'bg-rose-500 animate-ping' : 'bg-cyan-400 animate-pulse'}`}></span>
        <span className="text-slate-300 font-bold">CAM-01 [FORWARD DASHCAM 1080P]</span>
        <span className="text-slate-500">|</span>
        <span className="text-cyan-400">{objects.length} OBJECTS TRACKED</span>
      </div>

      {/* Collision Imminent Flashing Warning Over Viewport */}
      {collisionRiskScore > 0.6 && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-lg bg-rose-600/90 border border-rose-400 text-white font-mono text-xs font-bold shadow-[0_0_20px_rgba(255,42,109,0.7)] animate-bounce z-20 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          <span>BRAKE OVERRIDE ENGAGED (CNN+LSTM RISK &gt; 0.60)</span>
        </div>
      )}
    </div>
  );
};

export default HUDView;
