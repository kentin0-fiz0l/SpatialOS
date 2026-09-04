/**
 * Hand Tracking Service
 *
 * Real MediaPipe Hands integration loaded from CDN
 */
import { useHandStore } from '../stores/handStore';
import type { Vector3, HandGesture } from '../types/spatial.types';

// MediaPipe types (loaded from CDN)
declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

/**
 * Hand Tracking Service using MediaPipe Hands
 */
export class HandTrackingService {
  private stream: MediaStream | null = null;
  private hands: any = null;
  private camera: any = null;
  private videoElement: HTMLVideoElement | null = null;

  // Smoothing filter for hand positions (exponential moving average)
  private smoothedPositions: Map<string, Vector3> = new Map();
  private readonly SMOOTHING_FACTOR = 0.3; // 0 = no smoothing, 1 = no update

  async initialize(videoElement: HTMLVideoElement) {
    try {
      this.videoElement = videoElement;

      // Check if MediaPipe is loaded from CDN
      if (typeof window.Hands === 'undefined') {
        console.error('[HandTracking] MediaPipe not loaded from CDN');
        throw new Error('MediaPipe Hands not available. Check script tags in index.html');
      }

      // Get webcam stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: 'user',
        },
        audio: false,
      });

      videoElement.srcObject = this.stream;

      // Initialize MediaPipe Hands
      this.hands = new window.Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`;
        },
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1, // 0=lite, 1=full (better accuracy)
        minDetectionConfidence: 0.7, // Higher = more accurate detection
        minTrackingConfidence: 0.7, // Higher = smoother tracking
        smoothLandmarks: true, // Enable built-in smoothing
      });

      this.hands.onResults((results: any) => this.onResults(results));

      // Start camera
      this.camera = new window.Camera(videoElement, {
        onFrame: async () => {
          if (this.hands) {
            await this.hands.send({ image: videoElement });
          }
        },
        width: 640,
        height: 480,
      });

      await this.camera.start();

      useHandStore.getState().setCameraActive(true);
      useHandStore.getState().setTrackingActive(true);

      console.log('[HandTracking] MediaPipe Hands initialized');
      console.log('[HandTracking] Tracking up to 2 hands with full landmarks');
    } catch (error) {
      console.error('[HandTracking] Failed to initialize:', error);
      throw error;
    }
  }

  private onResults(results: any) {
    const store = useHandStore.getState();

    // Clear previous hands
    store.clearHands();

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      return;
    }

    // Process each detected hand
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i]?.label.toLowerCase() as 'left' | 'right';

      if (!handedness) continue;

      // Get key landmark positions (thumb tip = 4, index tip = 8)
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];

      // Convert from normalized [0,1] to 3D scene coordinates
      // MediaPipe uses (x, y, z) where z is depth from camera
      // We map to scene space: x: [-2, 2], y: [0, 3], z: [-4, -1]
      const rawPosition: Vector3 = [
        (thumbTip.x - 0.5) * 4, // Center and scale X
        (1 - thumbTip.y) * 3,   // Invert Y (screen to world) and scale
        thumbTip.z * -3 - 2,    // Map Z depth to [-4, -1]
      ];

      // Apply exponential smoothing to reduce jitter
      const smoothKey = `${handedness}-position`;
      const prevSmoothed = this.smoothedPositions.get(smoothKey);

      const position: Vector3 = prevSmoothed
        ? [
            prevSmoothed[0] * this.SMOOTHING_FACTOR + rawPosition[0] * (1 - this.SMOOTHING_FACTOR),
            prevSmoothed[1] * this.SMOOTHING_FACTOR + rawPosition[1] * (1 - this.SMOOTHING_FACTOR),
            prevSmoothed[2] * this.SMOOTHING_FACTOR + rawPosition[2] * (1 - this.SMOOTHING_FACTOR),
          ]
        : rawPosition;

      this.smoothedPositions.set(smoothKey, position);

      // Detect gestures using all finger landmarks
      const gesture = this.detectGesture(landmarks);

      // Calculate pinch distance (for two-handed interactions)
      const dx = thumbTip.x - indexTip.x;
      const dy = thumbTip.y - indexTip.y;
      const dz = (thumbTip.z || 0) - (indexTip.z || 0);
      const pinchDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Calculate hand rotation (wrist to middle finger base, projected onto XZ plane)
      const wrist = landmarks[0];
      const middleBase = landmarks[9]; // Middle finger MCP joint
      const handVecX = middleBase.x - wrist.x;
      const handVecZ = (middleBase.z || 0) - (wrist.z || 0);
      const rotation = Math.atan2(handVecX, handVecZ);

      // Update hand store
      store.updateHand(handedness, {
        position,
        gesture,
        visible: true,
        confidence: results.multiHandedness[i]?.score || 0.9,
        pinchDistance,
        rotation,
      });
    }
  }

  /**
   * Detect gesture from hand landmarks
   */
  private detectGesture(landmarks: any[]): HandGesture {
    // Landmark indices:
    // 0=wrist, 4=thumb_tip, 8=index_tip, 12=middle_tip, 16=ring_tip, 20=pinky_tip
    // 2=thumb_mcp, 5=index_mcp, 9=middle_mcp, 13=ring_mcp, 17=pinky_mcp

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp = landmarks[13];
    const pinkyMcp = landmarks[17];

    // Helper: calculate 3D distance
    const dist = (a: any, b: any) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = (a.z || 0) - (b.z || 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // Helper: is finger extended?
    const isExtended = (tip: any, mcp: any, wrist: any) => {
      // If tip is farther from wrist than MCP, finger is extended
      return dist(tip, wrist) > dist(mcp, wrist) * 1.2;
    };

    // Check finger states
    const indexExtended = isExtended(indexTip, indexMcp, wrist);
    const middleExtended = isExtended(middleTip, middleMcp, wrist);
    const ringExtended = isExtended(ringTip, ringMcp, wrist);
    const pinkyExtended = isExtended(pinkyTip, pinkyMcp, wrist);

    // Pinch: thumb and index close together
    const pinchDistance = dist(thumbTip, indexTip);
    if (pinchDistance < 0.05) {
      return 'pinch';
    }

    // Fist: all fingers curled
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'fist';
    }

    // Point: only index extended
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'point';
    }

    // Open: all fingers extended
    if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
      return 'open';
    }

    // Default: none
    return 'none';
  }

  stop() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }

    if (this.hands) {
      this.hands.close();
      this.hands = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.smoothedPositions.clear();

    useHandStore.getState().setCameraActive(false);
    useHandStore.getState().setTrackingActive(false);
    useHandStore.getState().clearHands();

    console.log('[HandTracking] Stopped');
  }
}

// Singleton instance
let trackingService: HandTrackingService | null = null;

/**
 * Initialize hand tracking
 */
export function initializeHandTracking(
  videoElement: HTMLVideoElement
): HandTrackingService {
  if (!trackingService) {
    trackingService = new HandTrackingService();
  }
  trackingService.initialize(videoElement);
  return trackingService;
}

/**
 * Get tracking service instance
 */
export function getHandTrackingService(): HandTrackingService | null {
  return trackingService;
}
