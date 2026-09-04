/**
 * Main 3D Scene Component
 *
 * Renders spatial objects using React Three Fiber + HandTrack3D
 */

import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { useVisibleObjects } from '../../stores/spatialStore';
import { useParticleStore } from '../../stores/particleStore';
import { useHandInteraction } from '../../hooks/useHandInteraction';
import { useCameraPositionTracking } from '../../hooks/useCameraPositionTracking';
import { getSpatialAudioService } from '../../services/spatialAudio';
import SpatialObject from './SpatialObject';
import HandCursor from './HandCursor';
import AIResponseBubble from '../UI/AIResponseBubble';
import ParticleEffects from './ParticleEffects';

/**
 * Scene content (must be inside Canvas)
 */
function SceneContent() {
  const objects = useVisibleObjects();
  const particleEvents = useParticleStore((state) => state.events);
  const removeParticleEvent = useParticleStore((state) => state.removeEvent);
  const { camera } = useThree();

  // Initialize spatial audio (attach listener to camera)
  useEffect(() => {
    const audioService = getSpatialAudioService();
    audioService.initialize(camera);
    console.log('[Scene3D] Spatial audio initialized');

    // Resume audio context on first user interaction (autoplay policy)
    const handleInteraction = () => {
      audioService.resume();
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [camera]);

  // Enable hand-object interaction
  useHandInteraction();

  // Track camera position for sensor fusion
  useCameraPositionTracking();

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[0, 2, 5]} fov={75} />

      {/* Lights */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-5, 5, -5]} intensity={0.3} />

      {/* Physics world */}
      <Physics gravity={[0, -9.81, 0]}>
        {/* Ground plane with physics collider */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </RigidBody>

        {/* Render spatial objects */}
        {objects.map((obj) => (
          <SpatialObject key={obj.id} object={obj} />
        ))}

        {/* Hand cursors */}
        <HandCursor hand="right" />
        <HandCursor hand="left" />

        {/* AI Response Bubble (rendered outside physics for UI layer) */}
      </Physics>

      {/* AI Response Bubble - floats in 3D space, independent of physics */}
      <AIResponseBubble />

      {/* Particle Effects - visual feedback for hand interactions */}
      <ParticleEffects events={particleEvents} onEventComplete={removeParticleEvent} />

      {/* Grid helper */}
      <Grid
        args={[20, 20]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#444444"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#666666"
        fadeDistance={30}
        fadeStrength={1}
        followCamera={false}
        position={[0, 0.01, 0]}
      />

      {/* Controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
}

/**
 * Main Scene3D component
 */
export default function Scene3D() {
  return (
    <div className="w-full h-full">
      <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
        <SceneContent />
      </Canvas>
    </div>
  );
}
