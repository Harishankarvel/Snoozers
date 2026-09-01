# AURA-AV // Autonomous Vehicle Decision Support System

A high-throughput, dark-mode web dashboard for an **Autonomous Vehicle (AV) Decision Support System** with explainability, real-time perception HUD overlay, telemetry instruments, auto-scrolling decision logs, and bi-directional fault injection.

---

## 🌟 Architecture & Features

- **Dual Auto-Reconnecting WebSockets**:
  - `ws://localhost:8000/ws/video`: High-frequency binary frame byte stream rendered directly to an HTML5 `<canvas>` using `createImageBitmap` and `requestAnimationFrame`.
  - `ws://localhost:8000/ws/telemetry`: Bi-directional JSON stream carrying 2D/3D bounding boxes, predicted trajectories, TTC metrics, vehicle dynamics, and multi-hypothesis AV decisions.
- **Main Feed & Perception HUD**:
  - Live video stream with overlaid dynamic corner-bracket bounding boxes, speed tags, confidence %, and distance in meters.
  - Spline trajectory prediction ribbons and ego vehicle trajectory envelope.
  - Inverse Perspective Mapping (IPM) 3D perspective grid and Top-Right Bird's Eye View (BEV) Mini-Radar with 360° sweep.
- **Telemetry Sidebar**:
  - Speedometer HUD gauge (km/h & mph) with autonomous drive mode indicator.
  - Time-To-Collision (TTC) Collision Radar & warning banner (`SAFE`, `CAUTION`, `CRITICAL`).
  - Vehicle dynamics: steering angle compass, G-force accelerometer, throttle %, and ABS brake pressure meters.
  - Detected objects summary matrix and sensor health subsystem (`CAM`, `LIDAR`, `RADAR`, `IMU`, `GNSS`).
- **Decision Stream & Explainability Terminal**:
  - Auto-scrolling cyber console outputting continuous AV decisions (`Maintain`, `Brake`, `Swerve`, `Emergency Braking`).
  - Multi-hypothesis counterfactual reasoning breakdown (why Swerve was rejected, why Maintain was blocked, and why Brake was selected).
  - Search, filter by severity, auto-scroll pause/resume, and JSON packet inspector.
- **Fault & Edge-Case Injection Panel**:
  - Instant trigger buttons for Cut-In Vehicle, Jaywalking Pedestrian, Sudden Hard Brake, Weather Degradation, Sensor Blindspot, and Reset Nominal.
  - Custom JSON payload transmitter over `/ws/telemetry`.
- **Procedural Simulator Fallback**:
  - Client-side procedural simulation engine ensuring the dashboard is fully functional both connected to FastAPI and in standalone preview.

---

## 📁 Repository Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── websockets.py    # /ws/video & /ws/telemetry streaming & fault receiver
│   │   ├── engine/
│   │   │   └── decision_engine.py # Multi-hypothesis rule engine & TTC calculations
│   │   ├── perception/
│   │   │   ├── projection.py    # Inverse Perspective Mapping (IPM) 2D->3D
│   │   │   └── tracker.py       # Object detection & SORT tracking integration
│   │   └── main.py              # FastAPI server & static dashboard route
│   ├── test_websockets.py       # Automated WebSocket & API verification suite
│   └── requirements.txt         # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx           # HUD Header & WebSocket monitors
│   │   │   ├── MainVideoFeed.tsx    # Layered Video + Overlay canvas engine
│   │   │   ├── TelemetrySidebar.tsx # Speedometer, TTC radar, dynamics, sensors
│   │   │   ├── DecisionLog.tsx      # Auto-scrolling decision console
│   │   │   └── ControlPanel.tsx     # Fault injection console & JSON dispatcher
│   │   ├── services/
│   │   │   ├── websocketService.ts  # Dual auto-reconnecting WebSocket client
│   │   │   └── mockSimulation.ts    # Procedural synthetic generator fallback
│   │   ├── types/
│   │   │   └── telemetry.ts         # TypeScript definitions
│   │   ├── utils/
│   │   │   └── audioAlerts.ts       # Web Audio API HUD sound synthesizers
│   │   ├── App.tsx                  # Master responsive layout
│   │   ├── index.css                # Cyber HUD Tailwind styling
│   │   └── main.tsx                 # React entrypoint
│   ├── index.html                   # Standalone self-contained dashboard
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
├── dashboard.html                   # Self-contained browser-ready dashboard
└── README.md
```

---

## 🚀 Getting Started

### 1. Run Backend Server (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Open the Web Dashboard
- Open **`http://localhost:8000`** in your browser.
- Alternatively, open `dashboard.html` directly in any web browser.

### 3. Run Automated WebSocket Tests
```bash
python backend/test_websockets.py
```