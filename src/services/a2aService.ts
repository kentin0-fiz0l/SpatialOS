/**
 * A2A (Agent-to-Agent) Service - Browser Implementation
 *
 * Multi-user collaboration service for SpatialOS with Physics Arbiter integration
 */

interface AgentCard {
  id: string;
  name: string;
  capabilities: string[];
  description: string;
  version: string;
  metadata?: Record<string, any>;
}

interface A2AMessage {
  from: string;
  to?: string;
  type: string;
  payload: any;
  timestamp?: number;
}

interface DiscoveryQuery {
  capabilities?: string[];
  userId?: string;
  metadata?: Record<string, any>;
}

type MessageHandler = (message: A2AMessage) => void | Promise<void>;

class A2AServiceImpl {
  private ws: WebSocket | null = null;
  private connected = false;
  private userId: string;
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private discoveryServerUrl = 'ws://localhost:3000';
  private reconnectTimer: number | null = null;

  constructor() {
    // Generate or retrieve persistent user ID
    this.userId = this.getOrCreateUserId();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.discoveryServerUrl);

        this.ws.onopen = () => {
          console.log('[A2A] ✅ Connected to discovery server');
          this.connected = true;

          // Register as a user agent
          this.send({
            type: 'register',
            payload: {
              id: `spatialos-user-${this.userId}`,
              name: `User ${this.userId.substring(0, 8)}`,
              capabilities: ['voice-commands', 'hand-tracking', 'object-placement', 'spatial-computing'],
              description: 'SpatialOS user agent',
              version: '1.0.0',
              metadata: {
                type: 'user-agent',
                userId: this.userId,
              },
            } as AgentCard,
          });

          // Set up Scene Sync handlers
          this.setupSceneSyncHandlers();

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[A2A] Invalid message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('[A2A] Disconnected');
          this.connected = false;

          // Auto-reconnect after 5 seconds
          this.reconnectTimer = window.setTimeout(() => {
            console.log('[A2A] Attempting reconnect...');
            this.connect();
          }, 5000);
        };

        this.ws.onerror = (error) => {
          console.error('[A2A] WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Discover agents by capabilities
   */
  async discover(query: DiscoveryQuery): Promise<AgentCard[]> {
    return new Promise((resolve) => {
      const handler = (data: string) => {
        const message = JSON.parse(data);
        if (message.type === 'discovery-result') {
          resolve(message.payload.agents);
          this.ws?.removeEventListener('message', wrappedHandler);
        }
      };

      const wrappedHandler = (event: MessageEvent) => handler(event.data);
      this.ws?.addEventListener('message', wrappedHandler);

      // Send discovery query
      this.send({
        type: 'discover',
        payload: query,
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        this.ws?.removeEventListener('message', wrappedHandler);
        resolve([]);
      }, 5000);
    });
  }

  /**
   * Send a message to another agent
   */
  async sendMessage(message: Omit<A2AMessage, 'from' | 'timestamp'>): Promise<void> {
    const fullMessage: A2AMessage = {
      ...message,
      from: `spatialos-user-${this.userId}`,
      timestamp: Date.now(),
    };

    this.send({
      type: 'message',
      payload: fullMessage,
    });
  }

  /**
   * Register a message handler
   */
  onMessage(messageType: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, new Set());
    }
    this.messageHandlers.get(messageType)!.add(handler);
  }

  /**
   * Remove a message handler
   */
  offMessage(messageType: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Validate object placement with Physics Arbiter
   */
  async validatePlacement(object: any): Promise<{ isValid: boolean; reason: string | null; collisions?: any[] }> {
    // Input validation
    if (!object || typeof object !== 'object') {
      console.error('[A2A] Invalid object: must be an object');
      return { isValid: false, reason: 'Invalid object data' };
    }

    if (!object.position || !Array.isArray(object.position) || object.position.length !== 3) {
      console.error('[A2A] Invalid position: must be [x, y, z] array');
      return { isValid: false, reason: 'Invalid position data' };
    }

    if (!object.type || typeof object.type !== 'string') {
      console.error('[A2A] Invalid type: must be a string');
      return { isValid: false, reason: 'Invalid object type' };
    }

    // Discover Physics Arbiter
    const arbiters = await this.discover({ capabilities: ['placement-validate'] });

    if (arbiters.length === 0) {
      console.warn('[A2A] ⚠️  Physics Arbiter unavailable - rejecting placement for safety');
      return { isValid: false, reason: 'Physics validation unavailable' };
    }

    const arbiter = arbiters[0];
    const requestId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[A2A] ⚠️  Validation timeout - rejecting placement for safety');
        resolve({ isValid: false, reason: 'Physics validation timeout' });
      }, 1000);

      // One-time handler for response
      const handler = (message: A2AMessage) => {
        if (message.payload.requestId === requestId) {
          clearTimeout(timeout);
          this.offMessage('placement-validate-result', handler);
          resolve({
            isValid: message.payload.isValid,
            reason: message.payload.reason,
            collisions: message.payload.collisions,
          });
        }
      };

      this.onMessage('placement-validate-result', handler);

      // Send validation request
      this.sendMessage({
        to: arbiter.id,
        type: 'placement-validate',
        payload: { object, requestId },
      });
    });
  }

  /**
   * Create object with Physics Arbiter validation and Scene Sync coordination
   */
  async createValidatedObject(objectData: any): Promise<{ success: boolean; id?: string; reason?: string }> {
    // Validate with Physics Arbiter
    const validation = await this.validatePlacement(objectData);

    if (!validation.isValid) {
      console.warn(`[A2A] ❌ Object placement rejected: ${validation.reason}`);
      return { success: false, reason: validation.reason || 'Invalid placement' };
    }

    console.log('[A2A] ✅ Placement validated by Physics Arbiter');

    // Import dynamically to avoid circular dependency
    const { useSpatialStore } = await import('../stores/spatialStore');
    const id = useSpatialStore.getState().addObject(objectData);

    // Notify Scene Sync of object creation
    await this.sendMessage({
      type: 'object-created',
      payload: {
        object: { ...objectData, id },
        userId: this.userId,
      },
    });

    console.log(`[A2A] 📤 Notified Scene Sync of object creation: ${id}`);

    return { success: true, id };
  }

  private handleMessage(message: any): void {
    if (message.type === 'message') {
      const a2aMessage = message.payload as A2AMessage;

      // Call handlers for this message type
      const handlers = this.messageHandlers.get(a2aMessage.type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(a2aMessage);
          } catch (error) {
            console.error('[A2A] Handler error:', error);
          }
        });
      }
    } else if (message.type === 'registered') {
      console.log('[A2A]    User ID:', this.userId);
      console.log('[A2A]    Endpoint:', this.discoveryServerUrl);
    }
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private getOrCreateUserId(): string {
    const STORAGE_KEY = 'spatialos-user-id';
    let userId = localStorage.getItem(STORAGE_KEY);

    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, userId);
    }

    return userId;
  }

  /**
   * Verify message is from an authorized agent
   */
  private isAuthorizedMessage(message: A2AMessage): boolean {
    // Check message has required fields
    if (!message.from || !message.type || !message.payload) {
      console.warn('[A2A] ⚠️  Invalid message structure');
      return false;
    }

    // Ignore messages from self
    if (message.from.includes(this.userId)) {
      return false;
    }

    // Only accept messages from known agent patterns
    const validPatterns = [
      /^spatialos-user-/,     // User agents
      /^physics-arbiter-/,    // Physics Arbiter
      /^scene-sync-/,         // Scene Sync
      /^spatial-memory-/,     // Spatial Memory
    ];

    const isValid = validPatterns.some(pattern => pattern.test(message.from));

    if (!isValid) {
      console.warn(`[A2A] ⚠️  Unauthorized agent: ${message.from}`);
    }

    return isValid;
  }

  /**
   * Validate object data structure
   */
  private isValidObjectData(object: any): boolean {
    if (!object || typeof object !== 'object') return false;
    if (!object.type || typeof object.type !== 'string') return false;
    if (!object.position || !Array.isArray(object.position) || object.position.length !== 3) return false;

    // Validate position values are numbers
    if (!object.position.every((n: any) => typeof n === 'number' && !isNaN(n))) return false;

    return true;
  }

  /**
   * Set up handlers for Scene Sync broadcasts
   */
  private setupSceneSyncHandlers(): void {
    // Listen for objects created by other users
    this.onMessage('object-created', async (message: A2AMessage) => {
      // Authorization check
      if (!this.isAuthorizedMessage(message)) {
        return;
      }

      console.log(`[A2A] 📥 Received object from ${message.from}`);

      const { object } = message.payload;

      // Input validation
      if (!this.isValidObjectData(object)) {
        console.warn('[A2A] ⚠️  Invalid object data, ignoring');
        return;
      }

      // Add to local store
      const { useSpatialStore } = await import('../stores/spatialStore');
      useSpatialStore.getState().addObject({
        ...object,
        createdBy: 'peer',
      });
    });

    // Listen for conflict resolutions from Scene Sync
    this.onMessage('conflict-resolved', (message: A2AMessage) => {
      // Authorization check
      if (!this.isAuthorizedMessage(message)) {
        return;
      }

      console.log('[A2A] ⚠️  Conflict resolved by Scene Sync:', message.payload.reason);
      // TODO: Update local state with resolved version
    });

    // Listen for object updates from Scene Sync
    this.onMessage('object-updated', async (message: A2AMessage) => {
      // Authorization check
      if (!this.isAuthorizedMessage(message)) {
        return;
      }

      const { objectId, updates } = message.payload;

      // Input validation
      if (!objectId || typeof objectId !== 'string') {
        console.warn('[A2A] ⚠️  Invalid objectId in update');
        return;
      }

      if (!updates || typeof updates !== 'object') {
        console.warn('[A2A] ⚠️  Invalid updates in object-updated');
        return;
      }

      const { useSpatialStore } = await import('../stores/spatialStore');
      useSpatialStore.getState().updateObject(objectId, updates);
    });

    console.log('[A2A] 📡 Scene Sync handlers registered');
  }

  /**
   * Query Spatial Memory for placement suggestions
   */
  async getPlacementSuggestion(objectType: string): Promise<{
    suggestion: { position: [number, number, number]; reason: string; confidence: number } | null;
    patterns?: any;
  }> {
    // Discover Spatial Memory agent
    const memoryAgents = await this.discover({ capabilities: ['pattern-suggest'] });

    if (memoryAgents.length === 0) {
      console.log('[A2A] Spatial Memory not available');
      return { suggestion: null };
    }

    const agent = memoryAgents[0];
    const requestId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[A2A] Spatial Memory query timeout');
        resolve({ suggestion: null });
      }, 2000);

      // One-time handler for response
      const handler = (message: A2AMessage) => {
        if (message.payload.requestId === requestId) {
          clearTimeout(timeout);
          this.offMessage('pattern-suggest-result', handler);
          resolve({
            suggestion: message.payload.suggestion,
            patterns: message.payload.patterns,
          });
        }
      };

      this.onMessage('pattern-suggest-result', handler);

      // Send query
      this.sendMessage({
        to: agent.id,
        type: 'pattern-suggest',
        payload: { objectType, userId: this.userId, requestId },
      });
    });
  }
}

export const a2aService = new A2AServiceImpl();

/**
 * Initialize A2A service with Physics Arbiter integration
 */
export async function initializeA2A(): Promise<void> {
  try {
    await a2aService.connect();
    console.log('[A2A] ✅ Multi-user enabled with Physics Arbiter');
  } catch (error) {
    console.warn('[A2A] ⚠️  Failed to initialize:', error);
    console.warn('[A2A] Running in single-user mode');
    throw error;
  }
}
