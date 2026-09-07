/**
 * AI Avatar 3D Component
 *
 * Renders an AI assistant avatar as a pulsing gradient sphere
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Html } from '@react-three/drei';
import type { Mesh } from 'three';
import type { AvatarContent } from '../../types/spatial.types';

interface Avatar3DProps {
  position: [number, number, number];
  content: AvatarContent;
}

export default function Avatar3D({ position, content }: Avatar3DProps) {
  const meshRef = useRef<Mesh>(null);
  const time = useRef(0);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;

    time.current += delta;

    // Different animation speeds based on state
    const speed = content.state === 'thinking' ? 4.0 : content.state === 'speaking' ? 2.0 : 1.0;

    // Pulsing scale animation
    const pulse = Math.sin(time.current * speed) * 0.1 + 1.0;
    meshRef.current.scale.setScalar(pulse);

    // Gentle floating (idle only)
    if (content.state === 'idle') {
      meshRef.current.position.y = position[1] + Math.sin(time.current * 0.5) * 0.05;
    } else {
      meshRef.current.position.y = position[1];
    }
  });

  // Avatar color based on state
  const getColor = () => {
    switch (content.state) {
      case 'thinking':
        return '#ff6b9d'; // Pink - thinking
      case 'speaking':
        return '#4ecdc4'; // Cyan - speaking
      default:
        return '#a78bfa'; // Purple - idle
    }
  };

  return (
    <group position={position}>
      {/* Main sphere */}
      <Sphere ref={meshRef} args={[0.3, 32, 32]}>
        <meshStandardMaterial
          color={getColor()}
          emissive={getColor()}
          emissiveIntensity={0.5}
          metalness={0.3}
          roughness={0.4}
        />
      </Sphere>

      {/* Outer glow */}
      <Sphere args={[0.35, 32, 32]}>
        <meshBasicMaterial
          color={getColor()}
          transparent
          opacity={0.2}
        />
      </Sphere>

      {/* Name label */}
      <Html
        position={[0, 0.6, 0]}
        center
        distanceFactor={5}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
          }}
        >
          {content.name}
        </div>
      </Html>

      {/* Response text bubble */}
      {content.state === 'speaking' && content.currentResponse && (
        <Html
          position={[0, 0.8, 0]}
          center
          distanceFactor={5}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(78, 205, 196, 0.95)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '14px',
              maxWidth: '300px',
              wordWrap: 'break-word',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              animation: 'fadeIn 0.3s ease-out',
            }}
          >
            {content.currentResponse}
          </div>
          <style>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </Html>
      )}

      {/* Thinking indicator */}
      {content.state === 'thinking' && (
        <Html
          position={[0, 0.8, 0]}
          center
          distanceFactor={5}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(255, 107, 157, 0.95)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            🤔 Thinking...
          </div>
        </Html>
      )}
    </group>
  );
}
