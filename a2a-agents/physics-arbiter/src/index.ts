/**
 * Physics Arbiter Agent
 *
 * Service agent that validates object placements and detects collisions
 * in multi-user spatial computing scenarios.
 *
 * Capabilities:
 * - collision-check: Check if object would collide with existing objects
 * - placement-validate: Validate object placement (bounds + collision)
 */

import { PhysicsEngine } from './physics-engine.js';
import { CollisionDetector } from './collision-detector.js';
import type { PhysicsConfig, CollisionCheckRequest, PlacementValidateRequest, SpatialObject } from './types.js';

// Import A2A client from parent directory
import { A2AClient } from '../../../a2a-server/src/a2a-client.js';
import type { A2AMessage } from '../../../a2a-server/src/types.js';

export class PhysicsArbiter {
  private a2aClient: A2AClient;
  private physicsEngine: PhysicsEngine;
  private collisionDetector: CollisionDetector;
  private config: PhysicsConfig;

  constructor(config?: Partial<PhysicsConfig>) {
    // Default physics configuration
    this.config = {
      bounds: {
        minX: -5,
        maxX: 5,
        minY: 0,
        maxY: 3,
        minZ: -5,
        maxZ: 0,
      },
      minObjectDistance: 0.3, // 30cm minimum spacing
      defaultObjectRadius: 0.15, // 15cm default radius
      ...config,
    };

    this.physicsEngine = new PhysicsEngine(this.config);
    this.collisionDetector = new CollisionDetector(this.config);

    // Create A2A client
    this.a2aClient = new A2AClient({
      agentCard: {
        id: 'physics-arbiter-001',
        name: 'Physics Arbiter',
        capabilities: ['collision-check', 'placement-validate'],
        description: 'Centralized physics validation for multi-user spatial computing',
        version: '1.0.0',
        metadata: {
          type: 'service-agent',
          stateless: false, // We maintain object registry
          userId: 'system',
        },
      },
      discoveryServerUrl: 'ws://localhost:3000',
    });
  }

  /**
   * Initialize the agent and connect to A2A discovery server
   */
  async initialize(): Promise<void> {
    console.log('[Physics Arbiter] Initializing...');

    // Connect to A2A server
    await this.a2aClient.connect();
    console.log('[Physics Arbiter] ✅ Connected to A2A discovery server');

    // Register message handlers
    this.a2aClient.onMessage('collision-check', this.handleCollisionCheck.bind(this));
    this.a2aClient.onMessage('placement-validate', this.handlePlacementValidate.bind(this));

    // Listen to object lifecycle events to maintain registry
    this.a2aClient.onMessage('object-created', this.handleObjectCreated.bind(this));
    this.a2aClient.onMessage('object-deleted', this.handleObjectDeleted.bind(this));

    console.log('[Physics Arbiter] ✅ Message handlers registered');
    console.log('[Physics Arbiter] 🎯 Ready to validate physics');
    console.log('[Physics Arbiter]    Bounds:', this.config.bounds);
    console.log('[Physics Arbiter]    Min spacing:', this.config.minObjectDistance);
  }

  /**
   * Handle collision check request
   */
  private async handleCollisionCheck(message: A2AMessage): Promise<void> {
    const payload = message.payload as CollisionCheckRequest;
    const { object, requestId } = payload;

    console.log(`[Physics Arbiter] 🔍 Collision check requested for object at [${object.position.join(', ')}]`);

    // Check collisions
    const collisions = this.collisionDetector.checkCollisions(object);

    // Send response back to requester
    await this.a2aClient.sendMessage({
      to: message.from,
      type: 'collision-check-result',
      payload: {
        hasCollision: collisions.length > 0,
        collisions,
        requestId,
      },
    });

    console.log(`[Physics Arbiter] ✅ Collision check response sent: ${collisions.length} collision(s)`);
  }

  /**
   * Handle placement validation request
   */
  private async handlePlacementValidate(message: A2AMessage): Promise<void> {
    const payload = message.payload as PlacementValidateRequest;
    const { object, requestId } = payload;

    console.log(`[Physics Arbiter] 🔍 Placement validation requested for object at [${object.position.join(', ')}]`);

    // Validate bounds
    const withinBounds = this.physicsEngine.validatePlacement(object);

    // Check collisions
    const collisions = this.collisionDetector.checkCollisions(object);

    // Determine validity
    const isValid = withinBounds && collisions.length === 0;
    const reason = !withinBounds
      ? 'Out of bounds'
      : collisions.length > 0
      ? `Collision with ${collisions.length} object(s)`
      : null;

    // Send response
    await this.a2aClient.sendMessage({
      to: message.from,
      type: 'placement-validate-result',
      payload: {
        isValid,
        reason,
        collisions,
        requestId,
      },
    });

    console.log(`[Physics Arbiter] ✅ Validation response sent: ${isValid ? 'VALID' : 'INVALID'} (${reason || 'OK'})`);
  }

  /**
   * Handle object creation event (add to collision registry)
   */
  private async handleObjectCreated(message: A2AMessage): Promise<void> {
    const { object } = message.payload as { object: SpatialObject };
    this.collisionDetector.registerObject(object);
  }

  /**
   * Handle object deletion event (remove from collision registry)
   */
  private async handleObjectDeleted(message: A2AMessage): Promise<void> {
    const { objectId } = message.payload as { objectId: string };
    this.collisionDetector.unregisterObject(objectId);
  }

  /**
   * Disconnect from A2A server
   */
  async disconnect(): Promise<void> {
    await this.a2aClient.disconnect();
    console.log('[Physics Arbiter] Disconnected');
  }
}

// Main entry point
async function main() {
  const arbiter = new PhysicsArbiter();

  try {
    await arbiter.initialize();

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n[Physics Arbiter] Shutting down...');
      await arbiter.disconnect();
      process.exit(0);
    });

    console.log('[Physics Arbiter] Press Ctrl+C to exit');
  } catch (error) {
    console.error('[Physics Arbiter] ❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default PhysicsArbiter;
