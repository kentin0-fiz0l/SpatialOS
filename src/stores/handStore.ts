/**
 * Hand Tracking Store
 *
 * Manages hand tracking state from MediaPipe
 */

import { create } from 'zustand';
import type { Vector3 } from '../types/spatial.types';

export interface HandLandmarks {
  landmarks: Array<{ x: number; y: number; z: number }>;
  handedness: 'Left' | 'Right';
  confidence: number;
}

export interface HandState {
  position: Vector3;
  gesture: 'pinch' | 'open' | 'fist' | 'point' | 'none';
  visible: boolean;
  confidence: number;
  pinchDistance?: number; // Distance between thumb and index tips (0-1, normalized)
  rotation?: number; // Hand rotation in radians around Y axis
}

interface HandStoreState {
  // Hand states
  leftHand: HandState | null;
  rightHand: HandState | null;

  // Camera/tracking state
  cameraActive: boolean;
  trackingActive: boolean;

  // Actions
  updateHand: (hand: 'left' | 'right', state: HandState | null) => void;
  setCameraActive: (active: boolean) => void;
  setTrackingActive: (active: boolean) => void;
  clearHands: () => void;
}

/**
 * Default hand state
 */
const DEFAULT_HAND_STATE: HandState = {
  position: [0, -10, 0], // Off-screen
  gesture: 'none',
  visible: false,
  confidence: 0,
};

/**
 * Hand tracking store
 */
export const useHandStore = create<HandStoreState>((set) => ({
  leftHand: null,
  rightHand: null,
  cameraActive: false,
  trackingActive: false,

  updateHand: (hand, state) => {
    set({
      [hand === 'left' ? 'leftHand' : 'rightHand']: state,
    });
  },

  setCameraActive: (active) => {
    set({ cameraActive: active });
  },

  setTrackingActive: (active) => {
    set({ trackingActive: active });
  },

  clearHands: () => {
    set({
      leftHand: null,
      rightHand: null,
    });
  },
}));

/**
 * Helper selectors
 */

// Get hand by side
export const useHand = (side: 'left' | 'right') =>
  useHandStore((state) => (side === 'left' ? state.leftHand : state.rightHand));

// Check if any hand is visible
export const useAnyHandVisible = () =>
  useHandStore(
    (state) =>
      (state.leftHand?.visible ?? false) || (state.rightHand?.visible ?? false)
  );

// Get tracking status (individual selectors to avoid re-render loops)
export const useCameraActive = () => useHandStore((state) => state.cameraActive);
export const useTrackingActive = () => useHandStore((state) => state.trackingActive);

// Get individual hands (to avoid object destructuring infinite loops)
export const useLeftHand = () => useHandStore((state) => state.leftHand);
export const useRightHand = () => useHandStore((state) => state.rightHand);
