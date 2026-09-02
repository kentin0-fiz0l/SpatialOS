/**
 * Spatial Object Renderer
 *
 * Renders different types of spatial objects in 3D
 */

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { Text } from '@react-three/drei';
import { TextureLoader } from 'three';
import type { SpatialObject as SpatialObjectType } from '../../types/spatial.types';
import type { Mesh } from 'three';
import type { Vector3 } from '../../types/spatial.types';

interface Props {
  object: SpatialObjectType;
}

export default function SpatialObject({ object }: Props) {
  const meshRef = useRef<Mesh>(null);

  // Render based on object type
  switch (object.type) {
    case 'note':
      return <NoteObject object={object} meshRef={meshRef} />;
    case 'timer':
      return <TimerObject object={object} meshRef={meshRef} />;
    case 'image':
      return <ImageObject object={object} meshRef={meshRef} />;
    case 'widget':
      return <WidgetObject object={object} meshRef={meshRef} />;
    default:
      return <DefaultObject object={object} meshRef={meshRef} />;
  }
}

/**
 * Note object (3D text panel)
 */
function NoteObject({ object, meshRef }: { object: SpatialObjectType; meshRef: any }) {
  const content = object.content as { text: string };
  const [x, y, z] = object.position;
  const rigidBodyRef = useRef<RapierRigidBody>(null);

  // Apply throw velocity as impulse
  useEffect(() => {
    const throwVelocity = (object as any).throwVelocity as Vector3 | undefined;
    if (throwVelocity && rigidBodyRef.current) {
      // Apply impulse (mass * velocity)
      const impulse = {
        x: throwVelocity[0] * 2, // Scale up for better feel
        y: throwVelocity[1] * 2,
        z: throwVelocity[2] * 2,
      };
      rigidBodyRef.current.applyImpulse(impulse, true);
      console.log(`[SpatialObject] Applied throw impulse:`, impulse);
    }
  }, [(object as any).throwVelocity]);

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={[x, y, z]}
      type="dynamic"
      colliders="cuboid"
      gravityScale={0.5}
      restitution={0.3}
    >
      <group>
        {/* Background panel */}
        <mesh ref={meshRef} castShadow>
          <boxGeometry args={[2, 1, 0.1]} />
          <meshStandardMaterial
            color="#3b82f6"
            transparent
            opacity={0.9}
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>

        {/* Text */}
        <Text
          position={[0, 0, 0.06]}
          fontSize={0.15}
          color="white"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.8}
          textAlign="center"
        >
          {content.text}
        </Text>
      </group>
    </RigidBody>
  );
}

/**
 * Timer object (countdown display)
 */
function TimerObject({ object, meshRef }: { object: SpatialObjectType; meshRef: any }) {
  const content = object.content as {
    duration: number;
    label?: string;
    startTime?: number;
    remainingTime?: number;
    paused?: boolean;
    pausedAt?: number;
  };
  const [x, y, z] = object.position;
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [tick, setTick] = useState(0);
  const isPaused = content.paused || false;

  // Force update every second for countdown, pulse when complete
  useFrame((state) => {
    const currentSecond = Math.floor(state.clock.elapsedTime);
    if (currentSecond !== tick && !isComplete && !isPaused) {
      setTick(currentSecond);
    }

    // Pulse animation when complete
    if (isComplete && meshRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.05 + 1;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  // Calculate remaining time
  const now = Date.now();
  const startTime = content.startTime || now;
  const pausedAt = content.pausedAt || now;

  const elapsed = isPaused
    ? Math.floor((pausedAt - startTime) / 1000) // Frozen at pause time
    : Math.floor((now - startTime) / 1000); // Continue counting

  const remaining = Math.max(0, (content.remainingTime || content.duration) - elapsed);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Timer complete?
  const isComplete = remaining === 0;
  const wasComplete = useRef(false);

  // Trigger notification on completion
  useEffect(() => {
    if (isComplete && !wasComplete.current) {
      wasComplete.current = true;

      // Play notification sound (Web Audio API)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      console.log(`[Timer] ⏰ Timer "${content.label || 'Timer'}" completed!`);
    }
  }, [isComplete, content.label]);

  // Color based on remaining time
  const progress = remaining / content.duration;
  const timerColor = isComplete
    ? '#ef4444' // Red when complete
    : progress > 0.5
    ? '#10b981' // Green when plenty of time
    : progress > 0.2
    ? '#f59e0b' // Orange when getting low
    : '#ef4444'; // Red when almost done

  // Apply throw velocity as impulse
  useEffect(() => {
    const throwVelocity = (object as any).throwVelocity as Vector3 | undefined;
    if (throwVelocity && rigidBodyRef.current) {
      const impulse = {
        x: throwVelocity[0] * 2,
        y: throwVelocity[1] * 2,
        z: throwVelocity[2] * 2,
      };
      rigidBodyRef.current.applyImpulse(impulse, true);
    }
  }, [(object as any).throwVelocity]);

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={[x, y, z]}
      type="dynamic"
      colliders="cuboid"
      gravityScale={0.5}
      restitution={0.3}
    >
      <group>
        {/* Background circle */}
        <mesh ref={meshRef} castShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.1, 32]} />
          <meshStandardMaterial
            color={timerColor}
            emissive={isComplete ? timerColor : '#000000'}
            emissiveIntensity={isComplete ? 0.5 : 0}
            transparent
            opacity={0.9}
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>

        {/* Progress ring */}
        {!isComplete && (
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <ringGeometry args={[0.85, 0.95, 32, 1, 0, (progress) * Math.PI * 2]} />
            <meshBasicMaterial
              color={timerColor}
              transparent
              opacity={0.8}
              side={2} // DoubleSide
            />
          </mesh>
        )}

        {/* Timer text */}
        <Text
          position={[0, 0, 0.06]}
          fontSize={0.25}
          color="white"
          anchorX="center"
          anchorY="middle"
          font="/fonts/Inter-Bold.woff"
        >
          {timeText}
        </Text>

        {/* Label */}
        {content.label && (
          <Text
            position={[0, -0.3, 0.06]}
            fontSize={0.1}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            {content.label}
          </Text>
        )}

        {/* Pause indicator */}
        {isPaused && (
          <Text
            position={[0, 0.4, 0.06]}
            fontSize={0.08}
            color="#f59e0b"
            anchorX="center"
            anchorY="middle"
          >
            ⏸ PAUSED
          </Text>
        )}
      </group>
    </RigidBody>
  );
}

/**
 * Image object (3D image display)
 */
function ImageObject({ object, meshRef }: { object: SpatialObjectType; meshRef: any }) {
  const content = object.content as {
    url: string;
    width?: number;
    height?: number;
  };
  const [x, y, z] = object.position;
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [texture, setTexture] = useState<any>(null);

  // Load image texture
  useEffect(() => {
    const loader = new TextureLoader();
    loader.load(
      content.url,
      (loadedTexture) => {
        setTexture(loadedTexture);
        setImageLoaded(true);
        console.log(`[ImageObject] Loaded image from ${content.url}`);
      },
      undefined,
      (error) => {
        console.error('[ImageObject] Failed to load image:', error);
      }
    );
  }, [content.url]);

  // Apply throw velocity as impulse
  useEffect(() => {
    const throwVelocity = (object as any).throwVelocity as Vector3 | undefined;
    if (throwVelocity && rigidBodyRef.current) {
      const impulse = {
        x: throwVelocity[0] * 2,
        y: throwVelocity[1] * 2,
        z: throwVelocity[2] * 2,
      };
      rigidBodyRef.current.applyImpulse(impulse, true);
    }
  }, [(object as any).throwVelocity]);

  // Calculate display size (default 1m width, scale height by aspect ratio)
  const displayWidth = content.width ? content.width / 1000 : 1; // Convert mm to m
  const displayHeight = content.height ? content.height / 1000 : 1;
  const aspectRatio = displayHeight / displayWidth;

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={[x, y, z]}
      type="dynamic"
      colliders="cuboid"
      gravityScale={0.5}
      restitution={0.3}
    >
      <group>
        {/* Frame background */}
        <mesh ref={meshRef} castShadow position={[0, 0, -0.02]}>
          <boxGeometry args={[displayWidth + 0.1, displayHeight * aspectRatio + 0.1, 0.05]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} metalness={0.2} />
        </mesh>

        {/* Image plane */}
        {imageLoaded && texture ? (
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[displayWidth, displayHeight * aspectRatio]} />
            <meshStandardMaterial map={texture} toneMapped={false} />
          </mesh>
        ) : (
          // Loading placeholder
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.1}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            Loading...
          </Text>
        )}
      </group>
    </RigidBody>
  );
}

/**
 * Widget object (interactive panels: clock, weather, todo, calendar)
 */
function WidgetObject({ object, meshRef }: { object: SpatialObjectType; meshRef: any }) {
  const content = object.content as {
    widgetType: 'calendar' | 'weather' | 'clock' | 'todo';
    data?: any;
  };
  const [x, y, z] = object.position;
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every second
  useFrame(() => {
    if (content.widgetType === 'clock') {
      const now = new Date();
      if (now.getSeconds() !== currentTime.getSeconds()) {
        setCurrentTime(now);
      }
    }
  });

  // Apply throw velocity as impulse
  useEffect(() => {
    const throwVelocity = (object as any).throwVelocity as Vector3 | undefined;
    if (throwVelocity && rigidBodyRef.current) {
      const impulse = {
        x: throwVelocity[0] * 2,
        y: throwVelocity[1] * 2,
        z: throwVelocity[2] * 2,
      };
      rigidBodyRef.current.applyImpulse(impulse, true);
    }
  }, [(object as any).throwVelocity]);

  // Render widget content based on type
  const renderWidget = () => {
    switch (content.widgetType) {
      case 'clock': {
        const hours = currentTime.getHours().toString().padStart(2, '0');
        const minutes = currentTime.getMinutes().toString().padStart(2, '0');
        const seconds = currentTime.getSeconds().toString().padStart(2, '0');
        const date = currentTime.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });

        return (
          <>
            <Text
              position={[0, 0.2, 0.06]}
              fontSize={0.35}
              color="white"
              anchorX="center"
              anchorY="middle"
              font="/fonts/Inter-Bold.woff"
            >
              {hours}:{minutes}:{seconds}
            </Text>
            <Text
              position={[0, -0.2, 0.06]}
              fontSize={0.12}
              color="#94a3b8"
              anchorX="center"
              anchorY="middle"
            >
              {date}
            </Text>
          </>
        );
      }

      case 'weather':
        return (
          <Text position={[0, 0, 0.06]} fontSize={0.15} color="white" anchorX="center" anchorY="middle">
            ☁️ Weather
            {'\n'}
            72°F Partly Cloudy
          </Text>
        );

      case 'calendar':
        return (
          <Text position={[0, 0, 0.06]} fontSize={0.12} color="white" anchorX="center" anchorY="middle">
            📅 {currentTime.toLocaleDateString()}
            {'\n'}
            No events today
          </Text>
        );

      case 'todo':
        return (
          <Text position={[0, 0, 0.06]} fontSize={0.12} color="white" anchorX="center" anchorY="middle">
            ✓ Todo List
            {'\n'}
            • Complete tasks
            {'\n'}
            • Review code
          </Text>
        );

      default:
        return <Text position={[0, 0, 0.06]} fontSize={0.15} color="white" anchorX="center" anchorY="middle">Widget</Text>;
    }
  };

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={[x, y, z]}
      type="dynamic"
      colliders="cuboid"
      gravityScale={0.5}
      restitution={0.3}
    >
      <group>
        {/* Widget background */}
        <mesh ref={meshRef} castShadow>
          <boxGeometry args={[1.5, 1, 0.1]} />
          <meshStandardMaterial
            color="#1e293b"
            transparent
            opacity={0.95}
            roughness={0.4}
            metalness={0.3}
          />
        </mesh>

        {/* Widget content */}
        {renderWidget()}

        {/* Widget type label */}
        <Text
          position={[0, -0.45, 0.06]}
          fontSize={0.08}
          color="#64748b"
          anchorX="center"
          anchorY="middle"
        >
          {content.widgetType.toUpperCase()}
        </Text>
      </group>
    </RigidBody>
  );
}

/**
 * Default object (placeholder)
 */
function DefaultObject({ object, meshRef }: { object: SpatialObjectType; meshRef: any }) {
  const [x, y, z] = object.position;
  const rigidBodyRef = useRef<RapierRigidBody>(null);

  // Apply throw velocity as impulse
  useEffect(() => {
    const throwVelocity = (object as any).throwVelocity as Vector3 | undefined;
    if (throwVelocity && rigidBodyRef.current) {
      const impulse = {
        x: throwVelocity[0] * 2,
        y: throwVelocity[1] * 2,
        z: throwVelocity[2] * 2,
      };
      rigidBodyRef.current.applyImpulse(impulse, true);
    }
  }, [(object as any).throwVelocity]);

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={[x, y, z]}
      type="dynamic"
      colliders="ball"
      restitution={0.5}
    >
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial
          color="#888888"
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
    </RigidBody>
  );
}
