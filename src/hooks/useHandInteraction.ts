/**
 * Hand Interaction Hook
 *
 * Manages grab/drag physics for spatial objects using hand gestures
 * Now includes AI query triggers via fist gesture
 */
import { useEffect, useRef } from 'react';
import { useLeftHand, useRightHand } from '../stores/handStore';
import { useSpatialStore } from '../stores/spatialStore';
import { useAIStore } from '../stores/aiStore';
import { useSpatialMemoryStore } from '../stores/spatialMemoryStore';
import { ollamaService } from '../services/ollamaService';
import type { Vector3 } from '../types/spatial.types';

interface PositionSample {
  position: Vector3;
  timestamp: number;
}

interface GrabbedObject {
  id: string;
  hand: 'left' | 'right';
  offset: Vector3; // Offset from hand position to object center
  positionHistory: PositionSample[]; // Last 5 positions for velocity calc
  twoHanded?: boolean; // Is object grabbed with both hands?
  initialScale?: Vector3; // Original scale when two-handed grab started
  initialDistance?: number; // Initial distance between hands (two-handed mode)
}

/**
 * Calculate distance between two 3D points
 */
function distance3D(a: Vector3, b: Vector3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Add two vectors
 */
function addVectors(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Subtract two vectors
 */
function subtractVectors(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Hook to manage hand-object interactions
 */
export function useHandInteraction() {
  const grabbedObjects = useRef<Map<string, GrabbedObject>>(new Map());
  const leftHand = useLeftHand();
  const rightHand = useRightHand();

  useEffect(() => {
    const GRAB_DISTANCE = 1.0; // Max distance to grab (meters) - increased for easier testing
    const AI_QUERY_RADIUS = 2.0; // Search radius for AI context (meters)

    // Create handState object for processing
    const handState = { leftHand, rightHand };

    // Process each hand
    (['left', 'right'] as const).forEach((handSide) => {
      const hand = handState[`${handSide}Hand`];

      if (!hand || !hand.visible) {
        // Release any objects held by this hand
        grabbedObjects.current.forEach((grabbed, objectId) => {
          if (grabbed.hand === handSide) {
            releaseObject(objectId, grabbed);
            grabbedObjects.current.delete(objectId);
          }
        });
        return;
      }

      // Check gesture type
      if (hand.gesture === 'pinch') {
        // PINCH: Grab/hold objects
        // Check if already holding an object
        const heldObject = Array.from(grabbedObjects.current.entries()).find(
          ([_, grabbed]) => grabbed.hand === handSide
        );

        if (heldObject) {
          // Update held object position
          const [objectId, grabbed] = heldObject as [string, GrabbedObject];
          updateGrabbedObject(objectId, grabbed, hand.position);
        } else {
          // Try to grab nearest object
          const nearestObject = findNearestObject(hand.position, GRAB_DISTANCE);
          console.log(`[HandInteraction] Pinch detected on ${handSide} hand at`, hand.position, 'nearest:', nearestObject);
          if (nearestObject) {
            grabObject(nearestObject.id, handSide, hand.position, nearestObject.position);
          }
        }
      } else if (hand.gesture === 'fist') {
        // FIST: Trigger AI query about nearby spatial context
        triggerAIQuery(hand.position, AI_QUERY_RADIUS);
      } else if (hand.gesture === 'point') {
        // POINT: Highlight nearest object
        highlightNearestObject(hand.position, GRAB_DISTANCE);
      } else {
        // OPEN/OTHER: Released pinch - drop any held objects
        grabbedObjects.current.forEach((grabbed, objectId) => {
          if (grabbed.hand === handSide) {
            // If in two-handed mode, check if the OTHER hand is still holding
            if (grabbed.twoHanded) {
              const otherHand = handSide === 'left' ? 'right' : 'left';
              const otherGrabbed = Array.from(grabbedObjects.current.entries()).find(
                ([id, g]) => id === objectId && g.hand === otherHand
              );

              if (otherGrabbed) {
                // Other hand is still grabbing - exit two-handed mode, keep object with other hand
                console.log(`[HandInteraction] Exiting two-handed mode for ${objectId}, keeping with ${otherHand} hand`);
                grabbed.twoHanded = false;
                grabbed.initialScale = undefined;
                grabbed.initialDistance = undefined;
                grabbedObjects.current.delete(objectId); // Remove this hand's entry
                return; // Don't release the object
              }
            }

            // Normal release: no two-handed mode or both hands released
            releaseObject(objectId, grabbed);
            grabbedObjects.current.delete(objectId);
          }
        });
      }
    });

    // Two-handed grabbing: Check if both hands are pinching the same object
    if (leftHand?.visible && rightHand?.visible &&
        leftHand.gesture === 'pinch' && rightHand.gesture === 'pinch') {

      const leftGrabbed = Array.from(grabbedObjects.current.entries()).find(
        ([_, grabbed]) => grabbed.hand === 'left'
      );
      const rightGrabbed = Array.from(grabbedObjects.current.entries()).find(
        ([_, grabbed]) => grabbed.hand === 'right'
      );

      // If both hands are grabbing the same object, enable two-handed mode
      if (leftGrabbed && rightGrabbed && leftGrabbed[0] === rightGrabbed[0]) {
        const [objectId, grabbed] = leftGrabbed;

        // Initialize two-handed mode if not already active
        if (!grabbed.twoHanded) {
          const obj = useSpatialStore.getState().getObject(objectId);
          if (obj) {
            const initialDistance = distance3D(leftHand.position, rightHand.position);
            grabbed.twoHanded = true;
            grabbed.initialScale = obj.scale;
            grabbed.initialDistance = initialDistance;
            console.log(`[HandInteraction] Two-handed grab started for ${objectId}, initial distance: ${initialDistance.toFixed(2)}m`);
          }
        }

        // Update two-handed object
        updateTwoHandedObject(objectId, grabbed, leftHand.position, rightHand.position);
      }
    }
  }, [leftHand, rightHand]); // Removed spatialStore from dependencies

  /**
   * Find the nearest object to a hand position
   */
  function findNearestObject(
    handPos: Vector3,
    maxDistance: number
  ): { id: string; position: Vector3; distance: number } | null {
    const objects = useSpatialStore.getState().getAllObjects();
    let nearest: { id: string; position: Vector3; distance: number } | null = null;

    objects.forEach((obj) => {
      // Skip if already grabbed
      if (grabbedObjects.current.has(obj.id)) return;

      const dist = distance3D(handPos, obj.position);
      if (dist <= maxDistance && (!nearest || dist < nearest.distance)) {
        nearest = {
          id: obj.id,
          position: obj.position,
          distance: dist,
        };
      }
    });

    return nearest;
  }

  /**
   * Grab an object
   */
  function grabObject(
    objectId: string,
    hand: 'left' | 'right',
    handPos: Vector3,
    objectPos: Vector3
  ) {
    const offset = subtractVectors(objectPos, handPos);
    const now = Date.now();

    grabbedObjects.current.set(objectId, {
      id: objectId,
      hand,
      offset,
      positionHistory: [{ position: handPos, timestamp: now }],
    });

    console.log(`[HandInteraction] Grabbed object ${objectId} with ${hand} hand`);
  }

  /**
   * Update grabbed object position
   */
  function updateGrabbedObject(objectId: string, grabbed: GrabbedObject, handPos: Vector3) {
    const newPosition = addVectors(handPos, grabbed.offset);
    const now = Date.now();

    useSpatialStore.getState().updateObject(objectId, {
      position: newPosition,
    });

    // Track position history for velocity calculation (keep last 5 samples)
    grabbed.positionHistory.push({ position: handPos, timestamp: now });
    if (grabbed.positionHistory.length > 5) {
      grabbed.positionHistory.shift();
    }
  }

  /**
   * Update two-handed object (position + scale)
   */
  function updateTwoHandedObject(
    objectId: string,
    grabbed: GrabbedObject,
    leftHandPos: Vector3,
    rightHandPos: Vector3
  ) {
    if (!grabbed.twoHanded || !grabbed.initialScale || !grabbed.initialDistance) {
      return; // Not in two-handed mode
    }

    // Calculate midpoint between hands (object position)
    const midpoint: Vector3 = [
      (leftHandPos[0] + rightHandPos[0]) / 2,
      (leftHandPos[1] + rightHandPos[1]) / 2,
      (leftHandPos[2] + rightHandPos[2]) / 2,
    ];

    // Calculate current distance between hands
    const currentDistance = distance3D(leftHandPos, rightHandPos);

    // Calculate scale multiplier (how much to scale object)
    const scaleMultiplier = currentDistance / grabbed.initialDistance;

    // Apply new scale (multiply initial scale by multiplier)
    const newScale: Vector3 = [
      grabbed.initialScale[0] * scaleMultiplier,
      grabbed.initialScale[1] * scaleMultiplier,
      grabbed.initialScale[2] * scaleMultiplier,
    ];

    // Update object position and scale
    useSpatialStore.getState().updateObject(objectId, {
      position: midpoint,
      scale: newScale,
    });

    // Track position history for velocity (use midpoint)
    const now = Date.now();
    grabbed.positionHistory.push({ position: midpoint, timestamp: now });
    if (grabbed.positionHistory.length > 5) {
      grabbed.positionHistory.shift();
    }
  }

  /**
   * Calculate velocity from position history
   */
  function calculateVelocity(history: PositionSample[]): Vector3 {
    if (history.length < 2) return [0, 0, 0];

    // Use last 3 samples for velocity (more stable than just 2)
    const samples = history.slice(-3);
    const first = samples[0];
    const last = samples[samples.length - 1];

    const dt = (last.timestamp - first.timestamp) / 1000; // Convert to seconds
    if (dt === 0) return [0, 0, 0];

    const dx = last.position[0] - first.position[0];
    const dy = last.position[1] - first.position[1];
    const dz = last.position[2] - first.position[2];

    return [dx / dt, dy / dt, dz / dt];
  }

  /**
   * Release object and apply throw velocity
   */
  function releaseObject(objectId: string, grabbed: GrabbedObject) {
    const velocity = calculateVelocity(grabbed.positionHistory);

    // Calculate speed (magnitude)
    const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);

    console.log(`[HandInteraction] Released object ${objectId}, velocity:`, velocity, `speed: ${speed.toFixed(2)} m/s`);

    // Apply throw velocity to object (SpatialObject will read this and apply impulse)
    useSpatialStore.getState().updateObject(objectId, {
      throwVelocity: velocity,
    } as any);

    // Clear throw velocity after a frame so it only applies once
    setTimeout(() => {
      useSpatialStore.getState().updateObject(objectId, {
        throwVelocity: undefined,
      } as any);
    }, 100);
  }

  /**
   * Find all objects within a radius
   */
  function findNearbyObjects(position: Vector3, radius: number) {
    const objects = useSpatialStore.getState().getAllObjects();
    const nearby: Array<{ id: string; type: string; position: Vector3; color?: string; distance: number }> = [];

    objects.forEach((obj) => {
      const dist = distance3D(position, obj.position);
      if (dist <= radius) {
        nearby.push({
          id: obj.id,
          type: obj.type,
          position: obj.position,
          color: (obj as any).color, // Color may not exist on all spatial objects
          distance: dist,
        });
      }
    });

    // Sort by distance (closest first)
    nearby.sort((a, b) => a.distance - b.distance);

    return nearby;
  }

  /**
   * Trigger AI query about spatial context
   */
  function triggerAIQuery(handPos: Vector3, radius: number) {
    const aiStore = useAIStore.getState();

    // Don't trigger if already loading
    if (aiStore.isLoading) {
      console.log('[HandInteraction] AI already loading, skipping trigger');
      return;
    }

    // Find nearby objects
    const nearbyObjects = findNearbyObjects(handPos, radius);

    // Find nearby spatial memories
    const nearbyMemories = useSpatialMemoryStore.getState().findNearbyMemories(handPos, radius);

    console.log(`[HandInteraction] Fist gesture detected! Hand at:`, handPos, `Nearby objects:`, nearbyObjects.length, `Nearby memories:`, nearbyMemories.length);

    // Build spatial prompt with both objects and memories
    const prompt = ollamaService.buildSpatialPrompt(handPos, nearbyObjects, nearbyMemories);

    // Query AI
    aiStore.queryAI(prompt, handPos);
  }

  /**
   * Highlight nearest object when pointing
   */
  function highlightNearestObject(handPos: Vector3, maxDistance: number) {
    const spatialStore = useSpatialStore.getState();
    const allObjects = spatialStore.getAllObjects();

    // Clear all highlights first
    allObjects.forEach((obj) => {
      if (obj.highlighted) {
        spatialStore.updateObject(obj.id, { highlighted: false });
      }
    });

    // Find nearest object
    const nearest = findNearestObject(handPos, maxDistance);

    if (nearest) {
      // Highlight the nearest object
      spatialStore.updateObject(nearest.id, { highlighted: true });
      console.log(`[HandInteraction] Highlighting object ${nearest.id} at distance ${nearest.distance.toFixed(2)}m`);
    }
  }

  return {
    isGrabbing: grabbedObjects.current.size > 0,
    grabbedObjectIds: Array.from(grabbedObjects.current.keys()),
  };
}
