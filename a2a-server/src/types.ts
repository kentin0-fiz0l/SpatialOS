/**
 * Minimal A2A Protocol Types
 */

export interface AgentCard {
  id: string;
  name: string;
  capabilities: string[];
  description: string;
  version: string;
  metadata?: Record<string, any>;
  registeredAt?: number;
  lastHeartbeat?: number;
}

export interface A2AMessage {
  from: string;
  to?: string; // undefined = broadcast
  type: string;
  payload: any;
  timestamp?: number;
}

export interface DiscoveryQuery {
  capabilities?: string[];
  userId?: string;
  metadata?: Record<string, any>;
}

export interface DiscoveryResult {
  agents: AgentCard[];
}

// Internal connection tracking
export interface AgentConnection {
  card: AgentCard;
  ws: any; // WebSocket
  connected: boolean;
  connectedAt: number;
}
