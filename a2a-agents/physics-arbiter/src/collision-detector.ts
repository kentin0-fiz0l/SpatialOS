/**
 * Collision Detection Engine
 *
 * Detects collisions between spatial objects using bounding sphere approximation
 */

import type { SpatialObject, Collision, PhysicsConfig } from './types.js';

export class CollisionDetector {
  private objects: Map<string, SpatialObject> = new Map();
  private config: PhysicsConfig;

  constructor(config: PhysicsConfig) {
    this.config = config;
  }

  /**
   * Register an object in the collision detection system
   */
  registerObject(object: SpatialObject): void {
    this.objects.set(object.id, object);
    console.log(`[CollisionDetector] Registered object ${object.id} at [${object.position.join(', ')}]`);
  }

  /**
   * Unregister an object from the collision detection system
   */
  unregisterObject(objectId: string): void {
    this.objects.delete(objectId);
    console.log(`[CollisionDetector] Unregistered object ${objectId}`);
  }

  /**
   * Check if a new object would collide with existing objects
   */
  checkCollisions(newObject: SpatialObject): Collision[] {
    const collisions: Collision[] = [];

    for (const [id, existingObject] of this.objects) {
      // Skip self-collision check
      if (id === newObject.id) {
        continue;
      }

      const distance = this.calculateDistance(newObject.position, existingObject.position);
      const minDistance = this.getMinDistance(newObject, existingObject);

      if (distance < minDistance) {
        const overlap = minDistance - distance;
        collisions.push({
          objectId: id,
          distance,
          overlap,
        });
      }
    }

    if (collisions.length > 0) {
      console.log(`[CollisionDetector] Found ${collisions.length} collision(s) for object at [${newObject.position.join(', ')}]`);
    }

    return collisions;
  }

  /**
   * Get all registered objects
   */
  getAllObjects(): SpatialObject[] {
    return Array.from(this.objects.values());
  }

  /**
   * Calculate Euclidean distance between two positions
   */
  private calculateDistance(pos1: [number, number, number], pos2: [number, number, number]): number {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    const dz = pos1[2] - pos2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get minimum allowed distance between two objects based on their radii
   */
  private getMinDistance(obj1: SpatialObject, obj2: SpatialObject): number {
    const radius1 = this.getObjectRadius(obj1);
    const radius2 = this.getObjectRadius(obj2);
    return radius1 + radius2;
  }

  /**
   * Get the collision radius for an object
   * Uses scale if available, otherwise uses default radius
   */
  private getObjectRadius(obj: SpatialObject): number {
    if (obj.scale) {
      // Use the largest scale dimension as radius
      return Math.max(...obj.scale) * this.config.defaultObjectRadius;
    }
    return this.config.defaultObjectRadius;
  }

  /**
   * Clear all registered objects
   */
  clear(): void {
    this.objects.clear();
    console.log('[CollisionDetector] Cleared all objects');
  }
}
