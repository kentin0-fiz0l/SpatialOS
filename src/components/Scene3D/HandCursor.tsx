/**
 * Hand Cursor Component
 *
 * Visualizes hand position in 3D space with gesture feedback
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Text } from '@react-three/drei';
import type { Mesh } from 'three';
import { Vector3 } from 'three';
import { useHand } from '../../stores/handStore';
import type { HandGesture } from '../../types/spatial.types';

interface Props {
  hand: 'left' | 'right';
}

/**
 * Get visual properties for each gesture
 */
function getGestureVisuals(gesture: HandGesture, baseColor: string) {
  switch (gesture) {
    case 'pinch':
      return {
        color: '#ff6b6b', // Red for pinch/grab
        size: 0.08,
        emissiveIntensity: 0.8,
        glowOpacity: 0.4,
        emoji: '🤏',
        showRings: true,
      };
    case 'fist':
      return {
        color: '#f59e0b', // Orange for fist
        size: 0.09,
        emissiveIntensity: 0.7,
        glowOpacity: 0.3,
        emoji: '✊',
        showRings: false,
      };
    case 'point':
      return {
        color: '#a78bfa', // Purple for point
        size: 0.07,
        emissiveIntensity: 0.6,
        glowOpacity: 0.3,
        emoji: '👆',
        showRings: false,
      };
    case 'open':
      return {
        color: '#22c55e', // Green for open hand
        size: 0.12,
        emissiveIntensity: 0.5,
        glowOpacity: 0.2,
        emoji: '✋',
        showRings: false,
      };
    default: // none
      return {
        color: baseColor,
        size: 0.1,
        emissiveIntensity: 0.5,
        glowOpacity: 0.2,
        emoji: null,
        showRings: false,
      };
  }
}

export default function HandCursor({ hand }: Props) {
  const meshRef = useRef<Mesh>(null);
  const handState = useHand(hand);

  // Base color based on hand
  const baseColor = hand === 'right' ? '#3b82f6' : '#10b981'; // Blue for right, green for left

  const visuals = handState
    ? getGestureVisuals(handState.gesture, baseColor)
    : getGestureVisuals('none', baseColor);

  // Smooth cursor movement
  useFrame(() => {
    if (meshRef.current && handState?.visible) {
      const [x, y, z] = handState.position;
      const targetPos = new Vector3(x, y, z);

      // Smooth interpolation (lerp)
      meshRef.current.position.lerp(targetPos, 0.3);
    }
  });

  if (!handState?.visible) {
    return null;
  }

  const [x, y, z] = handState.position;

  return (
    <group position={[x, y, z]}>
      {/* Main cursor sphere */}
      <Sphere ref={meshRef} args={[visuals.size, 16, 16]}>
        <meshStandardMaterial
          color={visuals.color}
          emissive={visuals.color}
          emissiveIntensity={visuals.emissiveIntensity}
          transparent
          opacity={0.8}
        />
      </Sphere>

      {/* Glow effect */}
      <Sphere args={[visuals.size + 0.05, 16, 16]}>
        <meshBasicMaterial
          color={visuals.color}
          transparent
          opacity={visuals.glowOpacity}
        />
      </Sphere>

      {/* Animated rings for pinch/grab */}
      {visuals.showRings && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.15, 0.01, 8, 32]} />
            <meshBasicMaterial
              color={visuals.color}
              transparent
              opacity={0.6}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.005, 8, 32]} />
            <meshBasicMaterial
              color={visuals.color}
              transparent
              opacity={0.3}
            />
          </mesh>
        </>
      )}

      {/* Gesture indicator emoji */}
      {visuals.emoji && (
        <Text
          position={[0, 0.3, 0]}
          fontSize={0.1}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {visuals.emoji}
        </Text>
      )}

      {/* Gesture label */}
      {handState.gesture !== 'none' && (
        <Text
          position={[0, -0.25, 0]}
          fontSize={0.06}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.002}
          outlineColor="#000000"
        >
          {handState.gesture.toUpperCase()}
        </Text>
      )}
    </group>
  );
}
