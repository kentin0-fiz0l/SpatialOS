/**
 * Sensor Fusion Service
 *
 * Fuses WiFi positioning (low freq, high noise) with camera position
 * (high freq, low noise) using Kalman filter for optimal accuracy.
 */

import { usePositioningStore } from '../stores/positioningStore';
import { KalmanFilter3D, type KalmanMeasurement } from '../utils/kalmanFilter';
import type { Vector3 } from '../types/spatial.types';

/**
 * Sensor Fusion Service
 */
export class SensorFusionService {
  private kalmanFilter: KalmanFilter3D | null = null;
  private animationId: number | null = null;
  private isRunning = false;

  // Last seen positions
  private lastWiFiPosition: Vector3 | null = null;
  private lastCameraPosition: Vector3 | null = null;
  private lastWiFiTimestamp = 0;
  private lastCameraTimestamp = 0;

  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Initialize Kalman filter with current best guess
    const store = usePositioningStore.getState();
    const initialPos = store.wifiPosition || store.cameraPosition || [0, 1.5, -2];

    this.kalmanFilter = new KalmanFilter3D(initialPos);

    console.log('[Sensor Fusion] Starting with initial position:', initialPos);

    // Start update loop
    this.update();
  }

  private update = () => {
    if (!this.isRunning) return;

    const store = usePositioningStore.getState();

    // Only fuse if we're in fusion mode and calibrated
    if (store.mode !== 'fusion' || !store.isCalibrated) {
      this.animationId = requestAnimationFrame(this.update);
      return;
    }

    const now = Date.now();

    // Check for new WiFi position
    if (store.wifiPosition && store.wifiPosition !== this.lastWiFiPosition) {
      this.lastWiFiPosition = store.wifiPosition;
      this.lastWiFiTimestamp = now;

      // Update Kalman filter with WiFi measurement
      const measurement: KalmanMeasurement = {
        value: store.wifiPosition,
        timestamp: now,
        type: 'wifi',
      };

      const fusedPos = this.kalmanFilter!.update(measurement);
      store.setFusedPosition(fusedPos as Vector3);

      console.log('[Sensor Fusion] WiFi update:', store.wifiPosition, '→ Fused:', fusedPos);
    }

    // Check for new camera position
    if (store.cameraPosition && store.cameraPosition !== this.lastCameraPosition) {
      this.lastCameraPosition = store.cameraPosition;
      this.lastCameraTimestamp = now;

      // Transform camera position to room coordinates
      const roomPos = this.cameraToRoomPosition(store.cameraPosition);

      // Update Kalman filter with camera measurement
      const measurement: KalmanMeasurement = {
        value: roomPos,
        timestamp: now,
        type: 'camera',
      };

      const fusedPos = this.kalmanFilter!.update(measurement);
      store.setFusedPosition(fusedPos as Vector3);

      // Don't log every camera update (too spammy at 60fps)
      // Only log occasionally for debugging
      if (now % 1000 < 16) {
        // ~once per second
        const uncertainty = this.kalmanFilter!.getUncertainty();
        console.log('[Sensor Fusion] Fused position:', fusedPos, 'Uncertainty:', uncertainty);
      }
    }

    this.animationId = requestAnimationFrame(this.update);
  };

  /**
   * Transform camera position to room coordinates using calibration
   */
  private cameraToRoomPosition(cameraPos: Vector3): Vector3 {
    const store = usePositioningStore.getState();
    const transform = store.cameraToRoomTransform;

    if (!transform) {
      return cameraPos; // No transform, return as-is
    }

    // Apply translation offset
    return [
      cameraPos[0] + transform.offset[0],
      cameraPos[1] + transform.offset[1],
      cameraPos[2] + transform.offset[2],
    ];
  }

  /**
   * Get current fusion statistics
   */
  getStats() {
    if (!this.kalmanFilter) return null;

    return {
      position: this.kalmanFilter.getPosition(),
      velocity: this.kalmanFilter.getVelocity(),
      uncertainty: this.kalmanFilter.getUncertainty(),
      lastWiFiUpdate: Date.now() - this.lastWiFiTimestamp,
      lastCameraUpdate: Date.now() - this.lastCameraTimestamp,
    };
  }

  stop() {
    this.isRunning = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.kalmanFilter = null;
    this.lastWiFiPosition = null;
    this.lastCameraPosition = null;

    console.log('[Sensor Fusion] Stopped');
  }
}

// Singleton instance
let fusionService: SensorFusionService | null = null;

/**
 * Initialize sensor fusion
 */
export function initializeSensorFusion(): SensorFusionService {
  if (!fusionService) {
    fusionService = new SensorFusionService();
  }
  fusionService.start();
  return fusionService;
}

/**
 * Get fusion service instance
 */
export function getSensorFusionService(): SensorFusionService | null {
  return fusionService;
}
