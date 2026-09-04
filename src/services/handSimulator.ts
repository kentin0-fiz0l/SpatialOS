/**
 * Hand Motion Simulator
 *
 * Generates synthetic hand movements for automated testing of grab/throw physics
 */

import type { Vector3, HandGesture } from '../types/spatial.types';

export interface SimulatedHandState {
  position: Vector3;
  gesture: HandGesture;
  visible: boolean;
  confidence: number;
}

export interface MotionPath {
  startPos: Vector3;
  endPos: Vector3;
  duration: number; // milliseconds
  curve?: 'linear' | 'arc' | 'bezier';
}

export interface ThrowSequence {
  name: string;
  grabPos: Vector3;
  throwPath: MotionPath;
  releaseVelocity?: Vector3; // Expected velocity at release
}

/**
 * Pre-defined test sequences
 */
export const TEST_SEQUENCES: ThrowSequence[] = [
  {
    name: 'Forward Throw (Medium)',
    grabPos: [0, 0.5, -1.6],
    throwPath: {
      startPos: [0, 0.5, -1.6],
      endPos: [0, 0.5, -0.8],
      duration: 500,
      curve: 'linear',
    },
    releaseVelocity: [0, 0, 1.6], // 0.8m in 0.5s = 1.6 m/s
  },
  {
    name: 'Upward Throw (High)',
    grabPos: [0, 0.5, -1.6],
    throwPath: {
      startPos: [0, 0.5, -1.6],
      endPos: [0, 1.5, -1.6],
      duration: 400,
      curve: 'linear',
    },
    releaseVelocity: [0, 2.5, 0], // 1.0m in 0.4s = 2.5 m/s
  },
  {
    name: 'Side Throw (Right)',
    grabPos: [0, 0.5, -1.6],
    throwPath: {
      startPos: [0, 0.5, -1.6],
      endPos: [0.8, 0.5, -1.6],
      duration: 600,
      curve: 'linear',
    },
    releaseVelocity: [1.33, 0, 0], // 0.8m in 0.6s = 1.33 m/s
  },
  {
    name: 'Arc Throw (Lob)',
    grabPos: [0, 0.3, -1.6],
    throwPath: {
      startPos: [0, 0.3, -1.6],
      endPos: [0, 0.8, -1.0],
      duration: 700,
      curve: 'arc',
    },
  },
  {
    name: 'Fast Throw (Power)',
    grabPos: [0, 0.5, -1.6],
    throwPath: {
      startPos: [0, 0.5, -1.6],
      endPos: [0, 0.5, -0.6],
      duration: 200,
      curve: 'linear',
    },
    releaseVelocity: [0, 0, 5.0], // 1.0m in 0.2s = 5.0 m/s
  },
];

export class HandSimulator {
  private currentSequence: ThrowSequence | null = null;
  private startTime: number = 0;
  private isRunning: boolean = false;
  private currentPhase: 'approach' | 'grab' | 'throw' | 'release' | 'done' = 'done';

  // Callbacks for logging
  private onGrabCallback?: (pos: Vector3) => void;
  private onReleaseCallback?: (pos: Vector3, velocity: Vector3) => void;

  constructor() {}

  /**
   * Start a test sequence
   */
  startSequence(sequence: ThrowSequence, callbacks?: {
    onGrab?: (pos: Vector3) => void;
    onRelease?: (pos: Vector3, velocity: Vector3) => void;
  }) {
    this.currentSequence = sequence;
    this.startTime = Date.now();
    this.isRunning = true;
    this.currentPhase = 'approach';
    this.onGrabCallback = callbacks?.onGrab;
    this.onReleaseCallback = callbacks?.onRelease;

    console.log('[HandSimulator] Starting sequence:', sequence.name);
  }

  /**
   * Stop the current sequence
   */
  stop() {
    this.isRunning = false;
    this.currentPhase = 'done';
    console.log('[HandSimulator] Stopped');
  }

  /**
   * Get current simulated hand state
   */
  getHandState(): SimulatedHandState | null {
    if (!this.isRunning || !this.currentSequence) {
      return null;
    }

    const elapsed = Date.now() - this.startTime;
    const sequence = this.currentSequence;

    // Phase 1: Approach (move to grab position) - 500ms
    if (this.currentPhase === 'approach') {
      if (elapsed > 500) {
        this.currentPhase = 'grab';
        console.log('[HandSimulator] Phase: GRAB');
      }

      return {
        position: sequence.grabPos,
        gesture: 'open',
        visible: true,
        confidence: 1.0,
      };
    }

    // Phase 2: Grab (pinch and hold) - 300ms
    if (this.currentPhase === 'grab') {
      const grabElapsed = elapsed - 500;

      if (grabElapsed === 0 || grabElapsed === 50) { // First frame of grab
        this.onGrabCallback?.(sequence.grabPos);
      }

      if (grabElapsed > 300) {
        this.currentPhase = 'throw';
        console.log('[HandSimulator] Phase: THROW');
      }

      return {
        position: sequence.grabPos,
        gesture: 'pinch',
        visible: true,
        confidence: 1.0,
      };
    }

    // Phase 3: Throw (move along path while pinching)
    if (this.currentPhase === 'throw') {
      const throwElapsed = elapsed - 800; // After approach + grab
      const progress = Math.min(throwElapsed / sequence.throwPath.duration, 1.0);

      if (progress >= 1.0) {
        this.currentPhase = 'release';
        console.log('[HandSimulator] Phase: RELEASE');
      }

      const position = this.interpolatePath(
        sequence.throwPath.startPos,
        sequence.throwPath.endPos,
        progress,
        sequence.throwPath.curve || 'linear'
      );

      return {
        position,
        gesture: 'pinch',
        visible: true,
        confidence: 1.0,
      };
    }

    // Phase 4: Release (open hand) - 100ms
    if (this.currentPhase === 'release') {
      const releaseElapsed = elapsed - (800 + sequence.throwPath.duration);

      if (releaseElapsed === 0 || releaseElapsed === 50) {
        // Calculate actual velocity from path
        const velocity = this.calculateVelocity(
          sequence.throwPath.startPos,
          sequence.throwPath.endPos,
          sequence.throwPath.duration
        );
        this.onReleaseCallback?.(sequence.throwPath.endPos, velocity);
      }

      if (releaseElapsed > 100) {
        this.currentPhase = 'done';
        this.isRunning = false;
        console.log('[HandSimulator] Sequence complete');
      }

      return {
        position: sequence.throwPath.endPos,
        gesture: 'open',
        visible: true,
        confidence: 1.0,
      };
    }

    // Done
    return null;
  }

  /**
   * Interpolate between two positions along a path
   */
  private interpolatePath(
    start: Vector3,
    end: Vector3,
    t: number,
    curve: 'linear' | 'arc' | 'bezier'
  ): Vector3 {
    if (curve === 'linear') {
      return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t,
      ];
    }

    if (curve === 'arc') {
      // Add a curved path (parabolic arc)
      const midY = Math.max(start[1], end[1]) + 0.3; // Arc peak
      const linearPos = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t,
      ];

      // Add parabolic Y offset
      const arcOffset = 4 * (midY - start[1]) * t * (1 - t);
      linearPos[1] += arcOffset;

      return linearPos as Vector3;
    }

    // Default to linear
    return [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ];
  }

  /**
   * Calculate velocity from path
   */
  private calculateVelocity(start: Vector3, end: Vector3, durationMs: number): Vector3 {
    const dt = durationMs / 1000; // Convert to seconds
    return [
      (end[0] - start[0]) / dt,
      (end[1] - start[1]) / dt,
      (end[2] - start[2]) / dt,
    ];
  }

  /**
   * Check if simulator is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): string {
    return this.currentPhase;
  }
}

// Singleton instance
export const handSimulator = new HandSimulator();
