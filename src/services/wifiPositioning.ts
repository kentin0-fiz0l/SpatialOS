/**
 * WiFi Positioning Service
 *
 * Connects to WiFi companion app and calculates room position
 */

import { usePositioningStore } from '../stores/positioningStore';
import type { WiFiSignal } from '../stores/positioningStore';
import { rssiToDistance, trilaterate, calculateConfidence } from '../utils/trilateration';
import type { Vector3 } from '../types/spatial.types';

const WS_URL = 'ws://localhost:8080'; // WiFi companion WebSocket
const RECONNECT_DELAY = 3000; // 3 seconds

interface WiFiScanResult {
  networks: Array<{
    ssid: string;
    bssid: string;
    rssi: number;
  }>;
  timestamp: number;
}

/**
 * WiFi Positioning Service
 */
export class WiFiPositioningService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.connect();
    console.log('[WiFi Positioning] Starting...');
  }

  private connect() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[WiFi Positioning] Connected to WiFi companion');
        usePositioningStore.getState().setConnected(true);

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Request WiFi scan
        this.requestScan();
      };

      this.ws.onclose = () => {
        console.log('[WiFi Positioning] Disconnected');
        usePositioningStore.getState().setConnected(false);
        usePositioningStore.getState().clearPosition();

        if (this.isRunning) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WiFi Positioning] WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      console.error('[WiFi Positioning] Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      console.log('[WiFi Positioning] Reconnecting...');
      this.connect();
    }, RECONNECT_DELAY);
  }

  private requestScan() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({ type: 'scan' }));

    // Request scan every 2 seconds
    setTimeout(() => {
      if (this.isRunning) {
        this.requestScan();
      }
    }, 2000);
  }

  private handleMessage(data: string) {
    try {
      const message: WiFiScanResult = JSON.parse(data);

      if (!message.networks) return;

      // Calculate position from WiFi signals
      const position = this.calculatePosition(message.networks);

      if (position) {
        console.log('[WiFi Positioning] Position:', position);
      }
    } catch (error) {
      console.error('[WiFi Positioning] Failed to handle message:', error);
    }
  }

  private calculatePosition(networks: WiFiScanResult['networks']): Vector3 | null {
    const store = usePositioningStore.getState();
    const routers = store.routers;

    if (routers.length < 3) {
      console.warn('[WiFi Positioning] Need 3+ calibrated routers');
      return null;
    }

    // Match detected networks to calibrated routers
    const signals = networks
      .map((network) => {
        const router = routers.find((r) => r.bssid === network.bssid);
        if (!router) return null;

        const distance = rssiToDistance(network.rssi);
        return {
          position: router.position,
          distance,
        };
      })
      .filter((s) => s !== null);

    if (signals.length < 3) {
      console.warn('[WiFi Positioning] Only found', signals.length, 'matching routers');
      return null;
    }

    // Trilaterate position
    const position = trilaterate(signals);
    if (!position) return null;

    // Calculate confidence
    const confidence = calculateConfidence(signals);

    // Update store
    store.setWiFiPosition(position, confidence);

    return position;
  }

  stop() {
    this.isRunning = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    usePositioningStore.getState().setConnected(false);
    usePositioningStore.getState().clearPosition();

    console.log('[WiFi Positioning] Stopped');
  }
}

// Singleton instance
let positioningService: WiFiPositioningService | null = null;

/**
 * Initialize WiFi positioning
 */
export function initializeWiFiPositioning(): WiFiPositioningService {
  if (!positioningService) {
    positioningService = new WiFiPositioningService();
  }
  positioningService.start();
  return positioningService;
}

/**
 * Get positioning service instance
 */
export function getWiFiPositioningService(): WiFiPositioningService | null {
  return positioningService;
}
