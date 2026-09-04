/**
 * Spatial Audio Service
 *
 * Generates and plays spatial audio for hand interactions
 * Uses Web Audio API with procedural sound generation
 */

import * as THREE from 'three';

export type SoundType = 'grab' | 'release' | 'throw' | 'error' | 'success';

interface AudioConfig {
  volume: number;
  frequency: number;
  duration: number;
  type?: OscillatorType;
}

/**
 * Sound configurations for different interaction types
 */
const SOUND_CONFIGS: Record<SoundType, AudioConfig> = {
  grab: {
    volume: 0.3,
    frequency: 800, // Hz (high pitch click)
    duration: 0.05, // 50ms
    type: 'sine',
  },
  release: {
    volume: 0.25,
    frequency: 400, // Hz (lower pitch)
    duration: 0.08, // 80ms
    type: 'sine',
  },
  throw: {
    volume: 0.35,
    frequency: 200, // Hz (whoosh)
    duration: 0.15, // 150ms
    type: 'sawtooth',
  },
  error: {
    volume: 0.4,
    frequency: 300, // Hz (error buzz)
    duration: 0.12,
    type: 'square',
  },
  success: {
    volume: 0.3,
    frequency: 600, // Hz (success chime)
    duration: 0.1,
    type: 'triangle',
  },
};

/**
 * Spatial Audio Service
 */
export class SpatialAudioService {
  private audioContext: AudioContext | null = null;
  private listener: THREE.AudioListener | null = null;
  private enabled: boolean = true;

  /**
   * Initialize audio system
   * @param camera - Three.js camera to attach listener to
   */
  initialize(camera: THREE.Camera): THREE.AudioListener {
    // Create audio context (lazy initialization)
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Create Three.js audio listener and attach to camera
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);

    console.log('[SpatialAudio] Initialized with listener attached to camera');
    return this.listener;
  }

  /**
   * Play a spatial sound at a 3D position
   * @param soundType - Type of sound to play
   * @param position - 3D position [x, y, z]
   * @param velocity - Optional velocity for pitch shift on throw sounds
   */
  play(soundType: SoundType, position: [number, number, number], velocity?: [number, number, number]) {
    if (!this.enabled || !this.audioContext || !this.listener) {
      console.warn('[SpatialAudio] Audio not initialized or disabled');
      return;
    }

    const config = SOUND_CONFIGS[soundType];

    // Resume audio context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Create positional audio source
    const sound = new THREE.PositionalAudio(this.listener);

    // Generate procedural sound using Web Audio API
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = config.type || 'sine';

    // Calculate frequency with optional velocity-based pitch shift
    let frequency = config.frequency;
    if (velocity && soundType === 'throw') {
      const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
      const pitchShift = Math.min(speed / 5, 1); // Max 1 octave shift
      frequency = config.frequency * (1 + pitchShift);
    }

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

    // Envelope: quick attack, exponential decay
    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(config.volume, now + 0.01); // 10ms attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + config.duration); // Exponential decay

    // Connect audio graph: oscillator -> gainNode -> positional audio
    oscillator.connect(gainNode);

    // Set the oscillator as the source for PositionalAudio
    sound.setNodeSource(oscillator);

    // Connect the gain envelope to the positional audio's output
    gainNode.connect(sound.getOutput());

    // Configure spatial audio properties
    sound.setRefDistance(1); // Distance at which volume = 1
    sound.setMaxDistance(10); // Distance at which sound is inaudible
    sound.setRolloffFactor(1); // How quickly volume decreases with distance

    // Position the sound in 3D space
    sound.position.set(...position);

    // Play the sound
    oscillator.start(now);
    oscillator.stop(now + config.duration);

    // Cleanup after sound finishes
    setTimeout(() => {
      sound.disconnect();
    }, config.duration * 1000 + 100);
  }

  /**
   * Enable/disable audio
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log(`[SpatialAudio] Audio ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if audio is available
   */
  isAvailable(): boolean {
    return this.audioContext !== null && this.listener !== null;
  }

  /**
   * Get audio context state
   */
  getState(): AudioContextState | null {
    return this.audioContext?.state || null;
  }

  /**
   * Resume audio context (call after user interaction for autoplay policy)
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('[SpatialAudio] Audio context resumed');
    }
  }
}

// Singleton instance
let audioService: SpatialAudioService | null = null;

/**
 * Get audio service instance
 */
export function getSpatialAudioService(): SpatialAudioService {
  if (!audioService) {
    audioService = new SpatialAudioService();
  }
  return audioService;
}
