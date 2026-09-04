/**
 * Physics Arbiter Agent Types
 *
 * Defines types for collision detection and placement validation
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

export interface SpatialObject {
  id: string;
  type: string;
  position: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  boundingBox?: BoundingBox;
}

export interface CollisionCheckRequest {
  object: SpatialObject;
  requestId: string;
}

export interface CollisionCheckResponse {
  hasCollision: boolean;
  collisions: Collision[];
  requestId: string;
}

export interface PlacementValidateRequest {
  object: SpatialObject;
  requestId: string;
}

export interface PlacementValidateResponse {
  isValid: boolean;
  reason: string | null;
  collisions: Collision[];
  requestId: string;
}

export interface Collision {
  objectId: string;
  distance: number;
  overlap: number;
}

export interface PhysicsBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface PhysicsConfig {
  bounds: PhysicsBounds;
  minObjectDistance: number; // Minimum distance between objects
  defaultObjectRadius: number; // Default collision radius
}
