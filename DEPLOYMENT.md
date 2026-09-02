# AURA-AV Autonomous Vehicle Dashboard — Deployment Guide

This guide walks you through deploying the **AURA-AV Decision Support System** using **Vercel (Frontend)** + **Render (Backend)** in less than 10 minutes.

---

## Architecture Overview

```
 ┌────────────────────────┐              ┌────────────────────────┐
 │   Vercel Edge CDN      │  WebSockets  │     Render Cloud       │
 │   (React + Vite SPA)   │ ───────────► │  (FastAPI + ML Model)  │
 │  https://*.vercel.app  │ (20 FPS WSS) │ https://*.onrender.com │
 └────────────────────────┘              └────────────────────────┘
```

---

## Step 1: Deploy the Backend on Render (FastAPI + WebSockets)

Render provides free persistent WebSocket hosting.

1. Go to [Render Dashboard](https://dashboard.render.com/) and sign in with GitHub.
2. Click **New +** $\rightarrow$ **Web Service**.
3. Select your GitHub repository (`Harishankarvel/Snoozers`).
4. Configure the settings:
   - **Name**: `aura-av-backend` (or your preferred name)
   - **Region**: Closest to you (e.g., `Oregon (US West)` or `Frankfurt`)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python` (or `Docker`)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`
5. Click **Create Web Service**.
6. Once deployed, copy your Render URL:
   - Example: `https://aura-av-backend.onrender.com`

---

## Step 2: Deploy the Frontend on Vercel (React + Vite)

1. Go to [Vercel Dashboard](https://vercel.com/new) and sign in with GitHub.
2. Click **Add New...** $\rightarrow$ **Project** and select `Harishankarvel/Snoozers`.
3. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Expand **Environment Variables**:
   - **Key**: `VITE_WS_URL`
   - **Value**: `wss://aura-av-backend.onrender.com` *(use your Render URL from Step 1)*
   > **Note**: You can enter either `https://...` or `wss://...` — the app automatically formats it to secure WebSockets (`wss://`).
5. Click **Deploy**.

---

## Step 3: Verify the Live Deployment

1. Open your Vercel URL (e.g. `https://snoozers.vercel.app`).
2. Verify that:
   - The top banner displays `🟢 Connected` with green telemetry pulses.
   - The Front Aperture camera feed streams real-time AI perception.
   - The Edge-Case Injection Panel triggers simulated events seamlessly over the live cloud WebSocket.

---

## Troubleshooting

- **Cold Start on Render Free Tier**:
  - The free tier on Render spins down after 15 minutes of inactivity. The first request may take ~30–45 seconds to wake up. Once awake, WebSockets stream continuously at full speed.
- **CORS or Connection Issues**:
  - FastAPI is pre-configured with `allow_origins=["*"]` to accept requests from any Vercel domain.
