/**
 * AI Response Bubble
 *
 * 3D floating text bubble that displays AI responses in the spatial scene
 */

import { useState, useEffect, useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCurrentResponse, useAIStore } from '../../stores/aiStore';
import type { Vector3 } from '../../types/spatial.types';

/**
 * 3D Floating Bubble Component
 */
export default function AIResponseBubble() {
  const currentResponse = useCurrentResponse();
  const dismissResponse = useAIStore((state) => state.dismissResponse);

  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const meshRef = useRef<any>(null);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    if (currentResponse) {
      setVisible(true);

      // Fade in
      setOpacity(0);
      const fadeIn = setInterval(() => {
        setOpacity((prev) => Math.min(prev + 0.1, 1));
      }, 50);

      // Auto-dismiss timer
      const timer = setTimeout(() => {
        dismissResponse();
      }, 15000);

      return () => {
        clearInterval(fadeIn);
        clearTimeout(timer);
      };
    } else {
      // Fade out
      const fadeOut = setInterval(() => {
        setOpacity((prev) => {
          const newOpacity = Math.max(prev - 0.1, 0);
          if (newOpacity === 0) {
            setVisible(false);
            clearInterval(fadeOut);
          }
          return newOpacity;
        });
      }, 50);

      return () => clearInterval(fadeOut);
    }
  }, [currentResponse, dismissResponse]);

  // Gentle floating animation
  useFrame((state) => {
    if (meshRef.current && visible) {
      const time = state.clock.getElapsedTime();
      meshRef.current.position.y = (currentResponse?.position[1] || 0) + 0.5 + Math.sin(time * 2) * 0.05;
    }
  });

  // Don't render if no response
  if (!currentResponse || !visible) {
    return null;
  }

  const position: Vector3 = [
    currentResponse.position[0],
    currentResponse.position[1] + 0.5, // Float 0.5m above hand
    currentResponse.position[2],
  ];

  return (
    <group ref={meshRef} position={position}>
      {/* Background panel */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          dismissResponse();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
        }}
      >
        <planeGeometry args={[2.2, 0.8]} />
        <meshStandardMaterial
          color="#1a1a1a"
          opacity={opacity * 0.9}
          transparent
        />
      </mesh>

      {/* Border */}
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[2.3, 0.9]} />
        <meshStandardMaterial
          color="#4a9eff"
          opacity={opacity * 0.6}
          transparent
        />
      </mesh>

      {/* AI Response Text */}
      <Text
        position={[0, 0, 0.01]}
        fontSize={0.12}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={2}
        textAlign="center"
        fillOpacity={opacity}
      >
        {currentResponse.text}
      </Text>

      {/* Dismiss hint text */}
      <Text
        position={[0, -0.3, 0.01]}
        fontSize={0.06}
        color="#888888"
        anchorX="center"
        anchorY="middle"
        fillOpacity={opacity * 0.7}
      >
        (click to dismiss)
      </Text>

      {/* Optional: Add a small indicator sphere above */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial
          color="#4a9eff"
          emissive="#4a9eff"
          emissiveIntensity={0.5}
          opacity={opacity}
          transparent
        />
      </mesh>
    </group>
  );
}
