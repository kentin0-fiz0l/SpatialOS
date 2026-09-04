/**
 * Minimal A2A Client
 *
 * Client library for connecting to the A2A discovery server
 */

import WebSocket from 'ws';
import type { AgentCard, A2AMessage, DiscoveryQuery, DiscoveryResult } from './types.js';

export interface A2AClientConfig {
  agentCard: Omit<AgentCard, 'registeredAt' | 'lastHeartbeat'>;
  discoveryServerUrl: string;
  autoReconnect?: boolean;
  heartbeatInterval?: number;
}

type MessageHandler = (message: A2AMessage) => void | Promise<void>;

export class A2AClient {
  private config: A2AClientConfig;
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(config: A2AClientConfig) {
    this.config = {
      autoReconnect: true,
      heartbeatInterval: 30000, // 30 seconds
      ...config,
    };
  }

  /**
   * Connect to the discovery server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.discoveryServerUrl);

      this.ws.on('open', () => {
        console.log('[A2A Client] ✅ Connected to discovery server');
        this.connected = true;

        // Register with the server
        this.send({
          type: 'register',
          payload: this.config.agentCard,
        });

        // Start heartbeat
        this.startHeartbeat();

        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[A2A Client] Invalid message:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('[A2A Client] Disconnected');
        this.connected = false;
        this.stopHeartbeat();

        if (this.config.autoReconnect) {
          setTimeout(() => this.connect(), 5000);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[A2A Client] Error:', error);
        reject(error);
      });
    });
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    this.config.autoReconnect = false;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Discover agents by capabilities
   */
  async discover(query: DiscoveryQuery): Promise<AgentCard[]> {
    return new Promise((resolve) => {
      const handler = (message: any) => {
        if (message.type === 'discovery-result') {
          resolve(message.payload.agents);
        }
      };

      // One-time listener
      this.ws?.once('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        handler(message);
      });

      // Send discovery query
      this.send({
        type: 'discover',
        payload: query,
      });
    });
  }

  /**
   * Send a message to another agent
   */
  async sendMessage(message: Omit<A2AMessage, 'from' | 'timestamp'>): Promise<void> {
    const fullMessage: A2AMessage = {
      ...message,
      from: this.config.agentCard.id,
      timestamp: Date.now(),
    };

    this.send({
      type: 'message',
      payload: fullMessage,
    });
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(message: Omit<A2AMessage, 'from' | 'to' | 'timestamp'>): Promise<void> {
    await this.sendMessage({
      ...message,
      to: undefined, // Broadcast
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
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(message: any): void {
    if (message.type === 'message') {
      // Incoming message from another agent
      const a2aMessage = message.payload as A2AMessage;

      // Call handlers for this message type
      const handlers = this.messageHandlers.get(a2aMessage.type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(a2aMessage);
          } catch (error) {
            console.error('[A2A Client] Handler error:', error);
          }
        });
      }
    }
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'heartbeat',
        from: this.config.agentCard.id,
      });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
