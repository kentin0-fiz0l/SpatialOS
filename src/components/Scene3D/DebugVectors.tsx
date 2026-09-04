/**
 * Debug Vectors Component
 *
 * Visualizes throw velocity vectors as 3D arrows
 */

import { useSpatialStore } from '../../stores/spatialStore';
import { ArrowHelper, Vector3 } from 'three';
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { Vector3 as Vector3Type } from '../../types/spatial.types';

export default function DebugVectors() {
  const debugMode = useSpatialStore((state) => state.debugMode);
  const objects = useSpatialStore((state) => state.getAllObjects());
  const { scene } = useThree();
  const arrowsRef = useRef<Map<string, ArrowHelper>>(new Map());

  useEffect(() => {
    if (!debugMode) {
      // Clear all arrows when debug mode is off
      arrowsRef.current.forEach((arrow) => scene.remove(arrow));
      arrowsRef.current.clear();
      return;
    }

    // Check for objects with throwVelocity
    objects.forEach((obj) => {
      const throwVelocity = (obj as any).throwVelocity as Vector3Type | undefined;

      if (throwVelocity) {
        const [vx, vy, vz] = throwVelocity;
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

        // Only show arrow if velocity is significant
        if (speed > 0.1) {
          // Remove old arrow for this object if it exists
          const oldArrow = arrowsRef.current.get(obj.id);
          if (oldArrow) {
            scene.remove(oldArrow);
          }

          // Create new arrow
          const origin = new Vector3(obj.position[0], obj.position[1], obj.position[2]);
          const direction = new Vector3(vx, vy, vz).normalize();
          const length = Math.min(speed * 0.5, 3); // Scale down, cap at 3m
          const color = speed > 2 ? 0xff0000 : speed > 1 ? 0xff8800 : 0x00ff00; // Red/Orange/Green

          const arrow = new ArrowHelper(direction, origin, length, color, 0.3, 0.2);
          scene.add(arrow);
          arrowsRef.current.set(obj.id, arrow);

          // Auto-remove after 2 seconds
          setTimeout(() => {
            scene.remove(arrow);
            arrowsRef.current.delete(obj.id);
          }, 2000);
        }
      }
    });
  }, [debugMode, objects, scene]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      arrowsRef.current.forEach((arrow) => scene.remove(arrow));
      arrowsRef.current.clear();
    };
  }, [scene]);

  return null; // This component just manages Three.js objects directly
}
