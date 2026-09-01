import { ConnectionStatus, FaultInjectionPayload, TelemetryPacket, WebSocketMetrics } from '../types/telemetry';

export type FrameCallback = (frameData: Blob | ArrayBuffer) => void;
export type TelemetryCallback = (packet: TelemetryPacket) => void;
export type StatusCallback = (metrics: WebSocketMetrics) => void;

class ReconnectingWebSocket {
  private url: string;
  private ws: WebSocket | null = null;
  private isBinary: boolean;
  private reconnectAttempts = 0;
  private maxReconnectInterval = 10000;
  private baseReconnectInterval = 1000;
  private reconnectTimer: any = null;
  private isExplicitlyClosed = false;
  private pingInterval: any = null;
  private lastPingSent = 0;

  public metrics: WebSocketMetrics;
  private statusListeners = new Set<StatusCallback>();
  private messageListeners = new Set<any>();

  // FPS & Throughput calculation
  private frameCount = 0;
  private bytesCount = 0;
  private lastFpsCalcTime = Date.now();

  constructor(url: string, isBinary = false) {
    this.url = url;
    this.isBinary = isBinary;
    this.metrics = {
      status: 'DISCONNECTED',
      url,
      latencyMs: 0,
      fps: 0,
      reconnectCount: 0,
      bytesReceived: 0,
      messagesReceived: 0,
      lastMessageTime: 0,
    };
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.updateStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      this.ws = new WebSocket(this.url);

      if (this.isBinary) {
        this.ws.binaryType = 'arraybuffer';
      }

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('CONNECTED');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        const now = Date.now();
        this.metrics.lastMessageTime = now;
        this.metrics.messagesReceived++;
        this.frameCount++;

        let payloadSize = 0;
        if (event.data instanceof ArrayBuffer) {
          payloadSize = event.data.byteLength;
        } else if (event.data instanceof Blob) {
          payloadSize = event.data.size;
        } else if (typeof event.data === 'string') {
          payloadSize = event.data.length;
        }
        this.bytesCount += payloadSize;
        this.metrics.bytesReceived += payloadSize;

        // Check if latency response (ping pong)
        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'pong' && parsed.clientTimestamp) {
              this.metrics.latencyMs = Math.max(1, now - parsed.clientTimestamp);
              this.notifyStatus();
              return;
            }
            // Dispatch to telemetry message listeners
            for (const listener of this.messageListeners) {
              listener(parsed);
            }
          } catch (e) {
            // Raw text or non-json
          }
        } else {
          // Binary frame data
          for (const listener of this.messageListeners) {
            listener(event.data);
          }
        }

        this.computeStats();
      };

      this.ws.onerror = (err) => {
        // WebSocket error
        this.updateStatus('ERROR');
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        if (!this.isExplicitlyClosed) {
          this.updateStatus('DISCONNECTED');
          this.scheduleReconnect();
        } else {
          this.updateStatus('DISCONNECTED');
        }
      };
    } catch (e) {
      this.updateStatus('ERROR');
      this.scheduleReconnect();
    }
  }

  public send(data: string | object | ArrayBuffer | Blob) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (typeof data === 'object' && !(data instanceof ArrayBuffer) && !(data instanceof Blob)) {
        this.ws.send(JSON.stringify(data));
      } else {
        this.ws.send(data as any);
      }
      return true;
    }
    return false;
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateStatus('DISCONNECTED');
  }

  public subscribe(callback: (data: any) => void) {
    this.messageListeners.add(callback);
    return () => {
      this.messageListeners.delete(callback);
    };
  }

  public onStatusChange(callback: StatusCallback) {
    this.statusListeners.add(callback);
    callback({ ...this.metrics });
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isExplicitlyClosed) return;

    this.reconnectAttempts++;
    this.metrics.reconnectCount = this.reconnectAttempts;

    // Exponential backoff with jitter
    const delay = Math.min(
      this.maxReconnectInterval,
      this.baseReconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1) + Math.random() * 500
    );

    this.updateStatus('RECONNECTING');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSent = Date.now();
        if (!this.isBinary) {
          this.ws.send(JSON.stringify({ type: 'ping', clientTimestamp: this.lastPingSent }));
        }
      }
    }, 3000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private computeStats() {
    const now = Date.now();
    const elapsed = (now - this.lastFpsCalcTime) / 1000;
    if (elapsed >= 1.0) {
      this.metrics.fps = Math.round(this.frameCount / elapsed);
      this.frameCount = 0;
      this.lastFpsCalcTime = now;
      this.notifyStatus();
    }
  }

  private updateStatus(status: ConnectionStatus) {
    this.metrics.status = status;
    this.notifyStatus();
  }

  private notifyStatus() {
    const copy = { ...this.metrics };
    for (const listener of this.statusListeners) {
      listener(copy);
    }
  }
}

// Global Singleton instances for the two required endpoints
class AVWebSocketService {
  public videoSocket: ReconnectingWebSocket;
  public telemetrySocket: ReconnectingWebSocket;

  constructor() {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss:' : 'ws:';
    const host = 'localhost:8000';

    this.videoSocket = new ReconnectingWebSocket(`${wsProtocol}//${host}/ws/video`, true);
    this.telemetrySocket = new ReconnectingWebSocket(`${wsProtocol}//${host}/ws/telemetry`, false);
  }

  public init() {
    this.videoSocket.connect();
    this.telemetrySocket.connect();
  }

  public destroy() {
    this.videoSocket.disconnect();
    this.telemetrySocket.disconnect();
  }

  public sendFaultInjection(payload: FaultInjectionPayload): boolean {
    const enriched = {
      ...payload,
      timestamp: Date.now(),
    };
    return this.telemetrySocket.send(enriched);
  }
}

export const avWebSocketService = new AVWebSocketService();
