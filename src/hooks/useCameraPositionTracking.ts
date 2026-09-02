/**
 * Camera Position Tracking Hook
 *
 * Tracks camera position from Three.js and feeds it to positioning store
 */

import { useThree, useFrame } from '@react-three/fiber';
import { usePositioningStore } from '../stores/positioningStore';
import type { Vector3 } from '../types/spatial.types';

/**
 * Hook to track camera position and update positioning store
 */
export function useCameraPositionTracking() {
  const camera = useThree((state) => state.camera);
  const setCameraPosition = usePositioningStore((state) => state.setCameraPosition);

  // Update camera position every frame
  useFrame(() => {
    const pos = camera.position;
    const position: Vector3 = [pos.x, pos.y, pos.z];
    setCameraPosition(position);
  });

  return null;
}
