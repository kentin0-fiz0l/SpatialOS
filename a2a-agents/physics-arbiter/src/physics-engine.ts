/**
 * Physics Engine
 *
 * Validates object placements against spatial bounds
 */

import type { SpatialObject, PhysicsConfig } from './types.js';

export class PhysicsEngine {
  private config: PhysicsConfig;

  constructor(config: PhysicsConfig) {
    this.config = config;
  }

  /**
   * Validate if an object placement is within bounds
   */
  validatePlacement(object: SpatialObject): boolean {
    const [x, y, z] = object.position;

    // Check if position is within configured bounds
    const withinBounds =
      x >= this.config.bounds.minX &&
      x <= this.config.bounds.maxX &&
      y >= this.config.bounds.minY &&
      y <= this.config.bounds.maxY &&
      z >= this.config.bounds.minZ &&
      z <= this.config.bounds.maxZ;

    if (!withinBounds) {
      console.log(`[PhysicsEngine] Object at [${x}, ${y}, ${z}] is out of bounds`);
      console.log(`[PhysicsEngine] Bounds: X[${this.config.bounds.minX}, ${this.config.bounds.maxX}] Y[${this.config.bounds.minY}, ${this.config.bounds.maxY}] Z[${this.config.bounds.minZ}, ${this.config.bounds.maxZ}]`);
    }

    return withinBounds;
  }

  /**
   * Get the current physics bounds
   */
  getBounds() {
    return this.config.bounds;
  }

  /**
   * Update physics configuration
   */
  updateConfig(config: Partial<PhysicsConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[PhysicsEngine] Configuration updated');
  }
}
