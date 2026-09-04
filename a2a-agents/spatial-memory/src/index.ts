/**
 * Spatial Memory Agent
 *
 * AI-powered spatial memory with pattern learning
 * - Records object history
 * - Learns placement patterns per user
 * - Semantic search with Ollama (future integration)
 */

import { A2AClient } from '../../../a2a-server/src/a2a-client.js';
import type { A2AMessage } from '../../../a2a-server/src/types.js';

interface ObjectEvent {
  type: 'created' | 'updated' | 'deleted';
  objectId: string;
  objectType?: string;
  position?: [number, number, number];
  userId: string;
  timestamp: number;
}

interface UserPattern {
  userId: string;
  objectType: string;
  positions: [number, number, number][];
  count: number;
  averagePosition: [number, number, number];
}

export class SpatialMemory {
  private a2aClient: A2AClient;
  private eventHistory: ObjectEvent[] = [];
  private userPatterns: Map<string, Map<string, UserPattern>> = new Map(); // userId -> objectType -> pattern

  constructor() {
    this.a2aClient = new A2AClient({
      agentCard: {
        id: 'spatial-memory-001',
        name: 'Spatial Memory',
        capabilities: ['memory-query', 'pattern-suggest'],
        description: 'AI-powered spatial memory and pattern learning',
        version: '1.0.0',
        metadata: {
          type: 'service-agent',
          stateful: true,
          ai: true,
        },
      },
      discoveryServerUrl: 'ws://localhost:3000',
    });
  }

  async initialize(): Promise<void> {
    console.log('[Spatial Memory] Initializing...');

    await this.a2aClient.connect();
    console.log('[Spatial Memory] ✅ Connected to A2A discovery server');

    // Register message handlers
    this.a2aClient.onMessage('memory-query', this.handleMemoryQuery.bind(this));
    this.a2aClient.onMessage('pattern-suggest', this.handlePatternSuggest.bind(this));
    this.a2aClient.onMessage('object-created', this.handleObjectCreated.bind(this));
    this.a2aClient.onMessage('object-updated', this.handleObjectUpdated.bind(this));
    this.a2aClient.onMessage('object-deleted', this.handleObjectDeleted.bind(this));

    console.log('[Spatial Memory] ✅ Message handlers registered');
    console.log('[Spatial Memory] 🧠 Ready to remember spatial patterns');
  }

  private async handleMemoryQuery(message: A2AMessage): Promise<void> {
    const { query, userId } = message.payload;

    console.log(`[Spatial Memory] 🔍 Query from ${userId}: "${query}"`);

    // Simple keyword search (Ollama semantic search would be more powerful)
    const results = this.eventHistory
      .filter(event =>
        event.userId === userId &&
        event.type === 'created' &&
        (event.objectType?.toLowerCase().includes(query.toLowerCase()))
      )
      .slice(-5); // Last 5 matching events

    await this.a2aClient.sendMessage({
      to: message.from,
      type: 'memory-query-result',
      payload: {
        results: results.map(e => ({
          objectId: e.objectId,
          type: e.objectType,
          position: e.position,
          timestamp: e.timestamp,
        })),
        query,
        requestId: message.payload.requestId,
      },
    });

    console.log(`[Spatial Memory] ✅ Found ${results.length} result(s)`);
  }

  private async handlePatternSuggest(message: A2AMessage): Promise<void> {
    const { objectType, userId } = message.payload;

    console.log(`[Spatial Memory] 🎯 Pattern suggestion requested: ${objectType} for ${userId}`);

    const userPatterns = this.userPatterns.get(userId);
    const pattern = userPatterns?.get(objectType);

    if (pattern && pattern.count >= 3) {
      // Suggest average position if user has placed this type 3+ times
      const suggestion = {
        position: pattern.averagePosition,
        reason: `You usually place ${objectType} objects in this area (${pattern.count} times)`,
        confidence: Math.min(pattern.count / 10, 1.0), // 0-1 scale
      };

      await this.a2aClient.sendMessage({
        to: message.from,
        type: 'pattern-suggest-result',
        payload: {
          suggestion,
          requestId: message.payload.requestId,
        },
      });

      console.log(`[Spatial Memory] ✅ Suggested position: [${pattern.averagePosition.join(', ')}] (confidence: ${suggestion.confidence.toFixed(2)})`);
    } else {
      await this.a2aClient.sendMessage({
        to: message.from,
        type: 'pattern-suggest-result',
        payload: {
          suggestion: null,
          reason: 'Not enough data to suggest a pattern',
          requestId: message.payload.requestId,
        },
      });

      console.log(`[Spatial Memory] ⚠️  No pattern found (need 3+ placements, have ${pattern?.count || 0})`);
    }
  }

  private async handleObjectCreated(message: A2AMessage): Promise<void> {
    const { object, userId } = message.payload;

    const event: ObjectEvent = {
      type: 'created',
      objectId: object.id,
      objectType: object.type,
      position: object.position,
      userId: userId || message.from,
      timestamp: Date.now(),
    };

    this.eventHistory.push(event);
    this.updatePattern(userId || message.from, object.type, object.position);

    console.log(`[Spatial Memory] 📝 Recorded: ${object.type} created by ${userId || message.from}`);
    console.log(`[Spatial Memory]    Total events: ${this.eventHistory.length}`);
  }

  private async handleObjectUpdated(message: A2AMessage): Promise<void> {
    const { objectId, updates, userId } = message.payload;

    const event: ObjectEvent = {
      type: 'updated',
      objectId,
      position: updates.position,
      userId: userId || message.from,
      timestamp: Date.now(),
    };

    this.eventHistory.push(event);

    console.log(`[Spatial Memory] 📝 Recorded: ${objectId} updated by ${userId || message.from}`);
  }

  private async handleObjectDeleted(message: A2AMessage): Promise<void> {
    const { objectId, userId } = message.payload;

    const event: ObjectEvent = {
      type: 'deleted',
      objectId,
      userId: userId || message.from,
      timestamp: Date.now(),
    };

    this.eventHistory.push(event);

    console.log(`[Spatial Memory] 📝 Recorded: ${objectId} deleted by ${userId || message.from}`);
  }

  private updatePattern(userId: string, objectType: string, position: [number, number, number]): void {
    if (!this.userPatterns.has(userId)) {
      this.userPatterns.set(userId, new Map());
    }

    const userPatterns = this.userPatterns.get(userId)!;

    if (!userPatterns.has(objectType)) {
      userPatterns.set(objectType, {
        userId,
        objectType,
        positions: [],
        count: 0,
        averagePosition: [0, 0, 0],
      });
    }

    const pattern = userPatterns.get(objectType)!;
    pattern.positions.push(position);
    pattern.count++;

    // Calculate running average
    pattern.averagePosition = [
      pattern.positions.reduce((sum, p) => sum + p[0], 0) / pattern.count,
      pattern.positions.reduce((sum, p) => sum + p[1], 0) / pattern.count,
      pattern.positions.reduce((sum, p) => sum + p[2], 0) / pattern.count,
    ];

    console.log(`[Spatial Memory] 📊 Pattern updated: ${userId} → ${objectType} (${pattern.count} placements)`);
  }

  async disconnect(): Promise<void> {
    await this.a2aClient.disconnect();
    console.log('[Spatial Memory] Disconnected');
  }
}

// Main entry point
async function main() {
  const spatialMemory = new SpatialMemory();

  try {
    await spatialMemory.initialize();

    process.on('SIGINT', async () => {
      console.log('\n[Spatial Memory] Shutting down...');
      await spatialMemory.disconnect();
      process.exit(0);
    });

    console.log('[Spatial Memory] Press Ctrl+C to exit');
  } catch (error) {
    console.error('[Spatial Memory] ❌ Fatal error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SpatialMemory;
