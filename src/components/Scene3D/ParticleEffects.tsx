/**
 * Particle Effects Component
 *
 * Renders particle bursts for hand interaction events:
 * - Grab (pinch start): blue particles at grab point
 * - Release (pinch end): green particles with velocity direction
 * - Throw (high velocity release): orange trail particles
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticleEvent {
  id: string;
  position: [number, number, number];
  velocity?: [number, number, number];
  type: 'grab' | 'release' | 'throw';
  createdAt: number;
}

interface ParticleEffectsProps {
  events: ParticleEvent[];
  onEventComplete?: (id: string) => void;
}

/**
 * Single particle burst effect
 */
function ParticleBurst({ event, onComplete }: { event: ParticleEvent; onComplete: () => void }) {
  const pointsRef = useRef<THREE.Points>(null);
  const startTime = useRef(Date.now());

  // Particle configuration based on event type
  const config = useMemo(() => {
    switch (event.type) {
      case 'grab':
        return {
          count: 20,
          color: new THREE.Color(0x3b82f6), // Blue
          size: 0.05,
          spread: 0.2,
          lifetime: 500, // ms
        };
      case 'release':
        return {
          count: 30,
          color: new THREE.Color(0x10b981), // Green
          size: 0.06,
          spread: 0.3,
          lifetime: 600,
        };
      case 'throw':
        return {
          count: 50,
          color: new THREE.Color(0xf97316), // Orange
          size: 0.08,
          spread: 0.4,
          lifetime: 800,
        };
    }
  }, [event.type]);

  // Generate particle positions and velocities
  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(config.count * 3);
    const velocities = new Float32Array(config.count * 3);

    for (let i = 0; i < config.count; i++) {
      const i3 = i * 3;

      // Start at event position with small random offset
      positions[i3] = event.position[0] + (Math.random() - 0.5) * 0.1;
      positions[i3 + 1] = event.position[1] + (Math.random() - 0.5) * 0.1;
      positions[i3 + 2] = event.position[2] + (Math.random() - 0.5) * 0.1;

      // Velocity: random sphere + event velocity (for throws)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = config.spread * (0.5 + Math.random() * 0.5);

      velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i3 + 2] = Math.cos(phi) * speed;

      // Add throw velocity if present
      if (event.velocity) {
        velocities[i3] += event.velocity[0] * 0.3;
        velocities[i3 + 1] += event.velocity[1] * 0.3;
        velocities[i3 + 2] += event.velocity[2] * 0.3;
      }
    }

    return { positions, velocities };
  }, [config.count, config.spread, event.position, event.velocity]);

  // Animate particles
  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    const elapsed = Date.now() - startTime.current;
    const progress = elapsed / config.lifetime;

    if (progress >= 1) {
      onComplete();
      return;
    }

    // Update positions
    const geometry = pointsRef.current.geometry;
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < config.count; i++) {
      const i3 = i * 3;

      // Apply velocity
      positionAttr.array[i3] += velocities[i3] * delta;
      positionAttr.array[i3 + 1] += velocities[i3 + 1] * delta;
      positionAttr.array[i3 + 2] += velocities[i3 + 2] * delta;

      // Apply gravity (slight downward pull)
      positionAttr.array[i3 + 1] -= 0.5 * delta;
    }

    positionAttr.needsUpdate = true;

    // Fade out material
    const material = pointsRef.current.material as THREE.PointsMaterial;
    material.opacity = 1 - progress;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={config.count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={config.size}
        color={config.color}
        transparent
        opacity={1}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * Main particle effects manager
 */
export default function ParticleEffects({ events, onEventComplete }: ParticleEffectsProps) {
  return (
    <>
      {events.map((event) => (
        <ParticleBurst
          key={event.id}
          event={event}
          onComplete={() => onEventComplete?.(event.id)}
        />
      ))}
    </>
  );
}
