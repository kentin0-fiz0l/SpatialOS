/**
 * Minimal A2A Discovery Server
 *
 * WebSocket server that enables agent discovery and message relay
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { AgentCard, AgentConnection, A2AMessage, DiscoveryQuery, DiscoveryResult } from './types.js';

class A2ADiscoveryServer {
  private wss: WebSocketServer;
  private agents: Map<string, AgentConnection> = new Map();
  private capabilityIndex: Map<string, Set<string>> = new Map(); // capability -> Set<agentId>

  constructor(port: number = 3000) {
    this.wss = new WebSocketServer({ port });
    console.log(`[A2A Server] Starting on port ${port}...`);
  }

  start(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[A2A Server] New connection');

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('[A2A Server] Invalid message:', error);
        }
      });

      ws.on('close', () => {
        // Find and unregister the disconnected agent
        for (const [id, conn] of this.agents) {
          if (conn.ws === ws) {
            this.unregisterAgent(id);
            break;
          }
        }
      });

      ws.on('error', (error) => {
        console.error('[A2A Server] WebSocket error:', error);
      });
    });

    this.wss.on('listening', () => {
      console.log('[A2A Server] ✅ Ready on ws://localhost:3000');
    });
  }

  private handleMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'register':
        this.handleRegister(ws, message.payload);
        break;

      case 'discover':
        this.handleDiscover(ws, message.payload);
        break;

      case 'message':
        this.handleRelay(message.payload);
        break;

      case 'heartbeat':
        this.handleHeartbeat(message.from);
        break;

      default:
        console.warn('[A2A Server] Unknown message type:', message.type);
    }
  }

  private handleRegister(ws: WebSocket, card: AgentCard): void {
    const connection: AgentConnection = {
      card: {
        ...card,
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      },
      ws,
      connected: true,
      connectedAt: Date.now(),
    };

    // Store agent
    this.agents.set(card.id, connection);

    // Index by capabilities
    for (const capability of card.capabilities) {
      if (!this.capabilityIndex.has(capability)) {
        this.capabilityIndex.set(capability, new Set());
      }
      this.capabilityIndex.get(capability)!.add(card.id);
    }

    console.log(`[A2A Server] ✅ Registered: ${card.name} (${card.id})`);
    console.log(`[A2A Server]    Capabilities: ${card.capabilities.join(', ')}`);
    console.log(`[A2A Server]    Total agents: ${this.agents.size}`);

    // Acknowledge registration
    this.send(ws, {
      type: 'registered',
      payload: { success: true, agentId: card.id },
    });
  }

  private handleDiscover(ws: WebSocket, query: DiscoveryQuery): void {
    const results: AgentCard[] = [];

    if (query.capabilities && query.capabilities.length > 0) {
      // Find agents with matching capabilities
      const matchingIds = new Set<string>();

      for (const capability of query.capabilities) {
        const agentIds = this.capabilityIndex.get(capability);
        if (agentIds) {
          agentIds.forEach(id => matchingIds.add(id));
        }
      }

      for (const id of matchingIds) {
        const conn = this.agents.get(id);
        if (conn && conn.connected) {
          results.push(conn.card);
        }
      }
    } else {
      // Return all agents
      for (const conn of this.agents.values()) {
        if (conn.connected) {
          results.push(conn.card);
        }
      }
    }

    console.log(`[A2A Server] 🔍 Discovery query: ${query.capabilities?.join(', ') || 'all'}`);
    console.log(`[A2A Server]    Found ${results.length} agent(s)`);

    this.send(ws, {
      type: 'discovery-result',
      payload: { agents: results } as DiscoveryResult,
    });
  }

  private handleRelay(message: A2AMessage): void {
    if (message.to) {
      // Point-to-point message
      const target = this.agents.get(message.to);
      if (target && target.connected) {
        this.send(target.ws, {
          type: 'message',
          payload: message,
        });
        console.log(`[A2A Server] 📤 Relayed: ${message.from} → ${message.to} (${message.type})`);
      } else {
        console.warn(`[A2A Server] ⚠️  Target not found: ${message.to}`);
      }
    } else {
      // Broadcast to all except sender
      let count = 0;
      for (const [id, conn] of this.agents) {
        if (id !== message.from && conn.connected) {
          this.send(conn.ws, {
            type: 'message',
            payload: message,
          });
          count++;
        }
      }
      console.log(`[A2A Server] 📢 Broadcast: ${message.from} → ${count} agent(s) (${message.type})`);
    }
  }

  private handleHeartbeat(agentId: string): void {
    const conn = this.agents.get(agentId);
    if (conn) {
      conn.card.lastHeartbeat = Date.now();
    }
  }

  private unregisterAgent(agentId: string): void {
    const conn = this.agents.get(agentId);
    if (!conn) return;

    // Remove from capability index
    for (const capability of conn.card.capabilities) {
      const agentIds = this.capabilityIndex.get(capability);
      if (agentIds) {
        agentIds.delete(agentId);
        if (agentIds.size === 0) {
          this.capabilityIndex.delete(capability);
        }
      }
    }

    // Remove from agents map
    this.agents.delete(agentId);

    console.log(`[A2A Server] ❌ Unregistered: ${conn.card.name} (${agentId})`);
    console.log(`[A2A Server]    Total agents: ${this.agents.size}`);
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

// Start server
const server = new A2ADiscoveryServer(3000);
server.start();

console.log('\n[A2A Server] Press Ctrl+C to exit\n');
