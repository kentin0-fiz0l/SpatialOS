/**
 * WiFi Positioning Store
 *
 * Manages WiFi router positions and room coordinates
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Vector3 } from '../types/spatial.types';

export interface WiFiRouter {
  id: string;
  ssid: string;
  bssid: string;
  position: Vector3; // [x, y, z] in meters from room origin
  name: string;
}

export interface WiFiSignal {
  bssid: string;
  ssid: string;
  rssi: number; // Signal strength in dBm
  timestamp: number;
}

export interface CalibrationPoint {
  roomPosition: Vector3; // Known position in room coordinates
  cameraPosition: Vector3; // Camera position at that time
  timestamp: number;
}

interface PositioningStoreState {
  // Router configuration
  routers: WiFiRouter[];

  // Position tracking
  wifiPosition: Vector3 | null; // Raw WiFi trilateration
  cameraPosition: Vector3 | null; // Camera position from OrbitControls
  fusedPosition: Vector3 | null; // Kalman-filtered fusion
  positionConfidence: number; // 0-1

  // Calibration data
  calibrationPoints: CalibrationPoint[];
  isCalibrated: boolean;
  cameraToRoomTransform: {
    offset: Vector3; // Translation offset
    scale: number; // Scale factor
  } | null;

  // Connection state
  connected: boolean;
  mode: 'disabled' | 'wifi-only' | 'fusion';

  // Actions
  addRouter: (router: Omit<WiFiRouter, 'id'>) => void;
  updateRouter: (id: string, updates: Partial<WiFiRouter>) => void;
  removeRouter: (id: string) => void;
  getRouter: (id: string) => WiFiRouter | undefined;

  setWiFiPosition: (position: Vector3, confidence: number) => void;
  setCameraPosition: (position: Vector3) => void;
  setFusedPosition: (position: Vector3) => void;

  addCalibrationPoint: (roomPos: Vector3, cameraPos: Vector3) => void;
  clearCalibration: () => void;
  calculateTransform: () => void;

  setConnected: (connected: boolean) => void;
  setMode: (mode: 'disabled' | 'wifi-only' | 'fusion') => void;

  clearPosition: () => void;
}

/**
 * WiFi Positioning Store with persistence
 */
export const usePositioningStore = create<PositioningStoreState>()(
  persist(
    (set, get) => ({
      routers: [],
      wifiPosition: null,
      cameraPosition: null,
      fusedPosition: null,
      positionConfidence: 0,
      calibrationPoints: [],
      isCalibrated: false,
      cameraToRoomTransform: null,
      connected: false,
      mode: 'disabled',

      addRouter: (router) => {
        const id = `router-${Date.now()}`;
        const newRouter: WiFiRouter = { ...router, id };

        set((state) => ({
          routers: [...state.routers, newRouter],
        }));

        console.log(`[Positioning] Added router: ${newRouter.name} at`, newRouter.position);
      },

      updateRouter: (id, updates) => {
        set((state) => ({
          routers: state.routers.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        }));
      },

      removeRouter: (id) => {
        set((state) => ({
          routers: state.routers.filter((r) => r.id !== id),
        }));
      },

      getRouter: (id) => {
        return get().routers.find((r) => r.id === id);
      },

      setWiFiPosition: (position, confidence) => {
        set({ wifiPosition: position, positionConfidence: confidence });
      },

      setCameraPosition: (position) => {
        set({ cameraPosition: position });
      },

      setFusedPosition: (position) => {
        set({ fusedPosition: position });
      },

      addCalibrationPoint: (roomPos, cameraPos) => {
        set((state) => ({
          calibrationPoints: [
            ...state.calibrationPoints,
            {
              roomPosition: roomPos,
              cameraPosition: cameraPos,
              timestamp: Date.now(),
            },
          ],
        }));

        // Auto-calculate transform if we have enough points
        get().calculateTransform();
      },

      clearCalibration: () => {
        set({
          calibrationPoints: [],
          isCalibrated: false,
          cameraToRoomTransform: null,
        });
      },

      calculateTransform: () => {
        const points = get().calibrationPoints;

        if (points.length < 2) {
          console.log('[Positioning] Need at least 2 calibration points');
          return;
        }

        // Calculate average offset
        let offsetX = 0,
          offsetY = 0,
          offsetZ = 0;

        points.forEach((point) => {
          offsetX += point.roomPosition[0] - point.cameraPosition[0];
          offsetY += point.roomPosition[1] - point.cameraPosition[1];
          offsetZ += point.roomPosition[2] - point.cameraPosition[2];
        });

        const offset: Vector3 = [
          offsetX / points.length,
          offsetY / points.length,
          offsetZ / points.length,
        ];

        // Calculate scale from calibration points
        const distance3D = (a: Vector3, b: Vector3): number => {
          const dx = a[0] - b[0];
          const dy = a[1] - b[1];
          const dz = a[2] - b[2];
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        };

        let totalScale = 0;
        let scaleSamples = 0;

        for (let i = 0; i < points.length - 1; i++) {
          for (let j = i + 1; j < points.length; j++) {
            const roomDist = distance3D(points[i].roomPosition, points[j].roomPosition);
            const camDist = distance3D(points[i].cameraPosition, points[j].cameraPosition);
            if (camDist > 0.01) {
              // Avoid division by near-zero
              totalScale += roomDist / camDist;
              scaleSamples++;
            }
          }
        }

        const scale = scaleSamples > 0 ? totalScale / scaleSamples : 1;

        set({
          cameraToRoomTransform: {
            offset,
            scale,
          },
          isCalibrated: true,
        });

        console.log('[Positioning] Calibration transform calculated:', { offset, scale });
      },

      setConnected: (connected) => {
        set({ connected });
      },

      setMode: (mode) => {
        set({ mode });
      },

      clearPosition: () => {
        set({
          wifiPosition: null,
          cameraPosition: null,
          fusedPosition: null,
          positionConfidence: 0,
        });
      },
    }),
    {
      name: 'spatialos-positioning',
      partialize: (state) => ({
        routers: state.routers,
        mode: state.mode,
        calibrationPoints: state.calibrationPoints,
        cameraToRoomTransform: state.cameraToRoomTransform,
        isCalibrated: state.isCalibrated,
      }),
    }
  )
);

/**
 * Helper selectors
 */

// Check if positioning is enabled
export const usePositioningEnabled = () =>
  usePositioningStore((state) => state.mode !== 'disabled');

// Get router count
export const useRouterCount = () =>
  usePositioningStore((state) => state.routers.length);

// Check if enough routers for trilateration (need 3+)
export const useHasEnoughRouters = () =>
  usePositioningStore((state) => state.routers.length >= 3);

// Calibration-specific hooks (avoid object destructuring infinite loops)
export const useCalibrationPoints = () =>
  usePositioningStore((state) => state.calibrationPoints);

export const useIsCalibrated = () =>
  usePositioningStore((state) => state.isCalibrated);

export const useCameraPosition = () =>
  usePositioningStore((state) => state.cameraPosition);

export const useAddCalibrationPoint = () =>
  usePositioningStore((state) => state.addCalibrationPoint);

export const useClearCalibration = () =>
  usePositioningStore((state) => state.clearCalibration);
