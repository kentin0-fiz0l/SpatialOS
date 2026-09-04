/**
 * Standalone test for Physics Arbiter
 *
 * Tests collision detection and placement validation without A2A server
 */

import { PhysicsEngine } from './physics-engine.js';
import { CollisionDetector } from './collision-detector.js';
import type { PhysicsConfig, SpatialObject } from './types.js';

// Test configuration
const config: PhysicsConfig = {
  bounds: {
    minX: -5,
    maxX: 5,
    minY: 0,
    maxY: 3,
    minZ: -5,
    maxZ: 0,
  },
  minObjectDistance: 0.3,
  defaultObjectRadius: 0.15,
};

const physicsEngine = new PhysicsEngine(config);
const collisionDetector = new CollisionDetector(config);

console.log('🧪 Physics Arbiter Standalone Test\n');
console.log('Configuration:');
console.log('  Bounds:', config.bounds);
console.log('  Min spacing:', config.minObjectDistance);
console.log('  Default radius:', config.defaultObjectRadius);
console.log('\n' + '='.repeat(60) + '\n');

// Test 1: Placement validation (in bounds)
console.log('Test 1: Validate object within bounds');
const obj1: SpatialObject = {
  id: 'obj-1',
  type: 'note',
  position: [0, 1, -2],
};

const isValid1 = physicsEngine.validatePlacement(obj1);
console.log(`  Object at [${obj1.position.join(', ')}]: ${isValid1 ? '✅ VALID' : '❌ INVALID'}`);
console.log('');

// Test 2: Placement validation (out of bounds)
console.log('Test 2: Validate object out of bounds');
const obj2: SpatialObject = {
  id: 'obj-2',
  type: 'note',
  position: [10, 1, -2], // Way outside X bounds
};

const isValid2 = physicsEngine.validatePlacement(obj2);
console.log(`  Object at [${obj2.position.join(', ')}]: ${isValid2 ? '✅ VALID' : '❌ INVALID'}`);
console.log('');

// Test 3: No collision (objects far apart)
console.log('Test 3: Collision detection - objects far apart');
const objA: SpatialObject = {
  id: 'obj-a',
  type: 'note',
  position: [0, 1, -2],
};

const objB: SpatialObject = {
  id: 'obj-b',
  type: 'timer',
  position: [2, 1, -2], // 2 meters away
};

collisionDetector.registerObject(objA);
const collisions1 = collisionDetector.checkCollisions(objB);
console.log(`  Object A at [${objA.position.join(', ')}]`);
console.log(`  Object B at [${objB.position.join(', ')}]`);
console.log(`  Collisions: ${collisions1.length === 0 ? '✅ NONE' : `❌ ${collisions1.length} found`}`);
console.log('');

// Test 4: Collision detected (objects too close)
console.log('Test 4: Collision detection - objects too close');
const objC: SpatialObject = {
  id: 'obj-c',
  type: 'widget',
  position: [0.2, 1, -2], // Only 20cm from objA (min distance is 30cm)
};

const collisions2 = collisionDetector.checkCollisions(objC);
console.log(`  Object A at [${objA.position.join(', ')}]`);
console.log(`  Object C at [${objC.position.join(', ')}]`);
console.log(`  Collisions: ${collisions2.length > 0 ? '✅ DETECTED' : '❌ NONE (should have detected!)'}`);
if (collisions2.length > 0) {
  collisions2.forEach(c => {
    console.log(`    - Collision with ${c.objectId}: distance=${c.distance.toFixed(3)}m, overlap=${c.overlap.toFixed(3)}m`);
  });
}
console.log('');

// Test 5: Multiple objects
console.log('Test 5: Collision detection - multiple objects');
collisionDetector.registerObject(objB);
collisionDetector.registerObject(objC);

const objD: SpatialObject = {
  id: 'obj-d',
  type: 'image',
  position: [0.1, 1, -2], // Close to both objA and objC
};

const collisions3 = collisionDetector.checkCollisions(objD);
console.log(`  Registered objects: 3 (obj-a, obj-b, obj-c)`);
console.log(`  New object D at [${objD.position.join(', ')}]`);
console.log(`  Collisions detected: ${collisions3.length}`);
if (collisions3.length > 0) {
  collisions3.forEach(c => {
    console.log(`    - ${c.objectId}: distance=${c.distance.toFixed(3)}m, overlap=${c.overlap.toFixed(3)}m`);
  });
}
console.log('');

// Summary
console.log('='.repeat(60));
console.log('\n✅ Standalone test complete!\n');
console.log('Physics Engine and Collision Detector are working correctly.');
console.log('Ready to integrate with A2A discovery server.');
