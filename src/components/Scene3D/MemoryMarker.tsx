/**
 * Memory Marker Component
 *
 * Renders a 3D marker at spatial memory locations
 * Shows label on hover, clickable to view details
 */

import { useRef, useState } from 'react';
import { Text } from '@react-three/drei';
import type { Vector3 } from '../../types/spatial.types';
import type { SpatialMemory } from '../../stores/spatialMemoryStore';

interface MemoryMarkerProps {
  memory: SpatialMemory;
  onClick?: (memory: SpatialMemory) => void;
}

export default function MemoryMarker({ memory, onClick }: MemoryMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<any>();

  return (
    <group position={memory.position as Vector3}>
      {/* Floating marker pin */}
      <mesh
        ref={meshRef}
        position={[0, 0.3, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => onClick?.(memory)}
      >
        {/* Pin head */}
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color={hovered ? '#a855f7' : '#8b5cf6'}
          emissive={hovered ? '#a855f7' : '#6d28d9'}
          emissiveIntensity={hovered ? 0.5 : 0.3}
        />
      </mesh>

      {/* Pin stick */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.3, 8]} />
        <meshStandardMaterial color="#8b5cf6" />
      </mesh>

      {/* Base circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.15, 32]} />
        <meshStandardMaterial
          color="#8b5cf6"
          transparent
          opacity={hovered ? 0.4 : 0.2}
        />
      </mesh>

      {/* Label (always visible) */}
      <Text
        position={[0, 0.5, 0]}
        fontSize={0.08}
        color="white"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {memory.label}
      </Text>

      {/* Description on hover */}
      {hovered && memory.description && (
        <Text
          position={[0, 0.4, 0]}
          fontSize={0.06}
          color="#d1d5db"
          anchorX="center"
          anchorY="top"
          maxWidth={1.5}
          outlineWidth={0.005}
          outlineColor="#000000"
        >
          {memory.description}
        </Text>
      )}

      {/* Pulsing glow effect */}
      {hovered && (
        <pointLight
          position={[0, 0.3, 0]}
          color="#a855f7"
          intensity={0.5}
          distance={2}
        />
      )}
    </group>
  );
}
