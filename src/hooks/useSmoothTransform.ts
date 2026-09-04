/**
 * Smooth Transform Hook
 *
 * Provides smooth interpolation for scale and rotation changes
 * Uses lerp (linear interpolation) for natural animation feel
 */

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vector3, Quaternion } from '../types/spatial.types';

interface SmoothTransformResult {
  smoothScale: THREE.Vector3;
  smoothRotation: THREE.Quaternion;
}

/**
 * Smoothly interpolate scale and rotation towards target values
 *
 * @param targetScale - Target scale [x, y, z]
 * @param targetRotation - Target rotation quaternion [x, y, z, w]
 * @param smoothingSpeed - Lerp speed (0-1, higher = faster). Default: 0.2
 */
export function useSmoothTransform(
  targetScale: Vector3,
  targetRotation: Quaternion,
  smoothingSpeed: number = 0.2
): SmoothTransformResult {
  // Current smooth values (Three.js objects for efficient updates)
  const smoothScale = useRef(new THREE.Vector3(...targetScale));
  const smoothRotation = useRef(new THREE.Quaternion(...targetRotation));

  // Track if we've initialized
  const initialized = useRef(false);

  // Target vectors (convert from arrays)
  const targetScaleVec = useRef(new THREE.Vector3());
  const targetRotationQuat = useRef(new THREE.Quaternion());

  // Update targets when props change
  useEffect(() => {
    targetScaleVec.current.set(...targetScale);
    targetRotationQuat.current.set(...targetRotation);

    // On first mount, snap to target immediately (no animation)
    if (!initialized.current) {
      smoothScale.current.copy(targetScaleVec.current);
      smoothRotation.current.copy(targetRotationQuat.current);
      initialized.current = true;
    }
  }, [targetScale, targetRotation]);

  // Lerp towards target every frame
  useFrame(() => {
    // Lerp scale (simple linear interpolation)
    smoothScale.current.lerp(targetScaleVec.current, smoothingSpeed);

    // Slerp rotation (spherical linear interpolation for smooth rotation)
    smoothRotation.current.slerp(targetRotationQuat.current, smoothingSpeed);
  });

  // Return refs to Three.js objects (components can use these directly)
  // We use a state to force re-render when refs change (though refs themselves don't trigger re-renders)
  const [result] = useState<SmoothTransformResult>({
    smoothScale: smoothScale.current,
    smoothRotation: smoothRotation.current,
  });

  return result;
}
