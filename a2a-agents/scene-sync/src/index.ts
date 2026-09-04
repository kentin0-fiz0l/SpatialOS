/**
 * Scene Sync Agent
 *
 * Authoritative state manager for spatial scenes
 * - Maintains single source of truth
 * - Resolves concurrent edit conflicts
 * - Broadcasts state updates to all users
 */

import { A2AClient } from '../../../a2a-server/src/a2a-client.js';
import type { A2AMessage } from '../../../a2a-server/src/types.js';

interface SpatialObject {
  id: string;
  type: string;
  position: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  version: number; // For conflict detection
  lastModified: number;
  lastModifiedBy: string;
}

interface SceneState {
  objects: Map<string, SpatialObject>;
  version: number;
}

export class SceneSync {
  private a2aClient: A2AClient;
  private state: SceneState = {
    objects: new Map(),
    version: 0,
  };

  constructor() {
    this.a2aClient = new A2AClient({
      agentCard: {
        id: 'scene-sync-001',
        name: 'Scene Sync',
        capabilities: ['state-sync', 'conflict-resolve'],
        description: 'Authoritative state management for spatial scenes',
        version: '1.0.0',
        metadata: {
          type: 'service-agent',
          stateful: true,
        },
      },
      discoveryServerUrl: 'ws://localhost:3000',
    });
  }

  async initialize(): Promise<void> {
    console.log('[Scene Sync] Initializing...');

    await this.a2aClient.connect();
    console.log('[Scene Sync] ✅ Connected to A2A discovery server');

    // Register message handlers
    this.a2aClient.onMessage('state-sync-request', this.handleStateSyncRequest.bind(this));
    this.a2aClient.onMessage('object-update-proposal', this.handleObjectUpdate.bind(this));
    this.a2aClient.onMessage('object-created', this.handleObjectCreated.bind(this));
    this.a2aClient.onMessage('object-deleted', this.handleObjectDeleted.bind(this));

    console.log('[Scene Sync] ✅ Message handlers registered');
    console.log('[Scene Sync] 🎯 Ready to sync scenes');
    console.log('[Scene Sync]    Strategy: Last-write-wins');
  }

  private async handleStateSyncRequest(message: A2AMessage): Promise<void> {
    console.log(`[Scene Sync] 🔄 State sync requested by ${message.from}`);

    const objects = Array.from(this.state.objects.values());

    await this.a2aClient.sendMessage({
      to: message.from,
      type: 'state-sync-response',
      payload: {
        objects,
        version: this.state.version,
        requestId: message.payload.requestId,
      },
    });

    console.log(`[Scene Sync] ✅ Sent state: ${objects.length} object(s), version ${this.state.version}`);
  }

  private async handleObjectUpdate(message: A2AMessage): Promise<void> {
    const { objectId, updates, clientVersion } = message.payload;

    const existing = this.state.objects.get(objectId);

    if (existing && existing.version !== clientVersion) {
      // Conflict detected!
      console.log(`[Scene Sync] ⚠️  Conflict detected for ${objectId}`);
      console.log(`[Scene Sync]    Client version: ${clientVersion}, Server version: ${existing.version}`);

      // Last-write-wins: Accept newer update
      const resolution = {
        ...existing,
        ...updates,
        version: existing.version + 1,
        lastModified: Date.now(),
        lastModifiedBy: message.from,
      };

      this.state.objects.set(objectId, resolution);
      this.state.version++;

      // Broadcast conflict resolution
      await this.a2aClient.broadcast({
        type: 'conflict-resolved',
        payload: {
          objectId,
          resolution,
          reason: 'last-write-wins',
        },
      });

      console.log(`[Scene Sync] ✅ Conflict resolved (last-write-wins)`);
    } else {
      // No conflict, apply update
      const updated = existing
        ? {
            ...existing,
            ...updates,
            version: existing.version + 1,
            lastModified: Date.now(),
            lastModifiedBy: message.from,
          }
        : {
            id: objectId,
            ...updates,
            version: 1,
            lastModified: Date.now(),
            lastModifiedBy: message.from,
          };

      this.state.objects.set(objectId, updated as SpatialObject);
      this.state.version++;

      // Broadcast update
      await this.a2aClient.broadcast({
        type: 'object-updated',
        payload: { objectId, updates: updated },
      });

      console.log(`[Scene Sync] ✅ Object updated: ${objectId} (version ${updated.version})`);
    }
  }

  private async handleObjectCreated(message: A2AMessage): Promise<void> {
    const { object } = message.payload;

    const spatialObject: SpatialObject = {
      ...object,
      version: 1,
      lastModified: Date.now(),
      lastModifiedBy: message.from,
    };

    this.state.objects.set(object.id, spatialObject);
    this.state.version++;

    console.log(`[Scene Sync] ➕ Object created: ${object.id} (${object.type})`);
    console.log(`[Scene Sync]    Total objects: ${this.state.objects.size}, State version: ${this.state.version}`);
  }

  private async handleObjectDeleted(message: A2AMessage): Promise<void> {
    const { objectId } = message.payload;

    const deleted = this.state.objects.delete(objectId);

    if (deleted) {
      this.state.version++;
      console.log(`[Scene Sync] ➖ Object deleted: ${objectId}`);
      console.log(`[Scene Sync]    Total objects: ${this.state.objects.size}, State version: ${this.state.version}`);
    } else {
      console.warn(`[Scene Sync] ⚠️  Delete failed: Object ${objectId} not found`);
    }
  }

  async disconnect(): Promise<void> {
    await this.a2aClient.disconnect();
    console.log('[Scene Sync] Disconnected');
  }
}

// Main entry point
async function main() {
  const sceneSync = new SceneSync();

  try {
    await sceneSync.initialize();

    process.on('SIGINT', async () => {
      console.log('\n[Scene Sync] Shutting down...');
      await sceneSync.disconnect();
      process.exit(0);
    });

    console.log('[Scene Sync] Press Ctrl+C to exit');
  } catch (error) {
    console.error('[Scene Sync] ❌ Fatal error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SceneSync;
