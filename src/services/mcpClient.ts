/**
 * MCP Client Service
 *
 * Connects browser to MCP server via WebSocket
 * Handles voice commands → spatial object creation
 */

import type { MCPCommand, MCPResponse, SpatialObjectContent } from '../types/spatial.types';
import { useSpatialStore } from '../stores/spatialStore';
import { usePositioningStore } from '../stores/positioningStore';
import { useMCPStore } from '../stores/mcpStore';

const WS_URL = 'ws://localhost:8765';
const TOKEN_URL = '/mcp-token'; // served by the mcpToken plugin in vite.config.ts
const RECONNECT_DELAY = 2000; // 2 seconds
const NOT_RUNNING_LOG_INTERVAL = 30_000; // don't spam the console while the server is down

// Close codes from the server (mcp-server/lib.ts). Both mean "don't reconnect".
const CLOSE_UNAUTHORIZED = 1008;
const CLOSE_SUPERSEDED = 4000;

export class MCPClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private lastNotRunningLog = 0;

  constructor() {
    void this.connect();
  }

  /**
   * Fetch the server's token, then open the WebSocket. The token file only exists while
   * the MCP server runs, so a 404 just means "not started yet": keep retrying quietly.
   */
  async connect() {
    let token: string;
    try {
      const res = await fetch(TOKEN_URL, { cache: 'no-store' });
      if (!res.ok) {
        const now = Date.now();
        if (now - this.lastNotRunningLog > NOT_RUNNING_LOG_INTERVAL) {
          console.log(`[MCP Client] MCP server not running (${res.status} from ${TOKEN_URL}); will keep trying`);
          this.lastNotRunningLog = now;
        }
        this.scheduleReconnect();
        return;
      }
      token = ((await res.json()) as { token: string }).token;
    } catch (error) {
      console.error('[MCP Client] Could not fetch MCP token:', error);
      this.scheduleReconnect();
      return;
    }

    try {
      this.ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

      this.ws.onopen = () => {
        console.log('[MCP Client] Connected to MCP server');
        this.isConnected = true;
        useMCPStore.getState().setConnected(true);

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onclose = (event) => {
        console.log('[MCP Client] Disconnected from MCP server');
        this.isConnected = false;
        useMCPStore.getState().setConnected(false);

        if (event.code === CLOSE_UNAUTHORIZED) {
          console.error(`[MCP Client] Server refused the connection: ${event.reason}. Open the app from http://localhost:5173.`);
          return;
        }
        if (event.code === CLOSE_SUPERSEDED) {
          console.warn('[MCP Client] Another SpatialOS tab took over the voice connection; this tab will stay disconnected.');
          return;
        }

        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[MCP Client] WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      console.error('[MCP Client] Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_DELAY);
  }

  /**
   * Handle incoming message from MCP server
   */
  private handleMessage(data: string) {
    let command: MCPCommand;
    try {
      command = JSON.parse(data);
    } catch (error) {
      console.error('[MCP Client] Ignoring unparseable message:', error);
      return;
    }
    console.log('[MCP Client] Received command:', command.type);

    try {
      this.sendResponse(command.id, this.handleCommand(command));
    } catch (error) {
      // The server prefixes "Error:" itself, so send the bare message.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MCP Client] Command ${command.type} failed:`, message);
      this.sendResponse(command.id, undefined, message);
    }
  }

  /**
   * Handle MCP command
   */
  private handleCommand(command: MCPCommand): any {
    const store = useSpatialStore.getState();

    switch (command.type) {
      case 'createObject': {
        if (!command.objectType || !command.content) {
          throw new Error('Missing objectType or content');
        }

        const positioningStore = usePositioningStore.getState();

        const objectData: any = {
          type: command.objectType,
          content: command.content as SpatialObjectContent,
          room: store.currentRoom,
          createdBy: 'voice',
          persistent: true,
          visible: true,
        };

        // Use fused position if sensor fusion is enabled and calibrated
        if (command.position) {
          objectData.position = command.position;
        } else if (
          positioningStore.mode === 'fusion' &&
          positioningStore.isCalibrated &&
          positioningStore.fusedPosition
        ) {
          // Use fused position (optimal combination of WiFi + camera)
          objectData.position = positioningStore.fusedPosition;
          console.log('[MCP Client] Using fused position:', positioningStore.fusedPosition);
        }

        const id = store.addObject(objectData);

        return { id };
      }

      case 'deleteObject': {
        if (!command.objectId) {
          throw new Error('Missing objectId');
        }

        store.deleteObject(command.objectId);
        return { success: true };
      }

      case 'listObjects': {
        let objects = store.getAllObjects();

        // Apply filter if provided
        if (command.filter?.type) {
          objects = objects.filter((obj) => obj.type === command.filter!.type);
        }

        return {
          objects: objects.map((obj) => ({
            id: obj.id,
            type: obj.type,
            content: obj.content,
            position: obj.position,
            room: obj.room,
          })),
        };
      }

      case 'updateObject': {
        if (!command.objectId) {
          throw new Error('Missing objectId');
        }

        const updates: any = {};
        if (command.position) {
          updates.position = command.position;
        }
        if (command.content) {
          updates.content = command.content;
        }
        store.updateObject(command.objectId, updates);

        return { success: true };
      }

      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  /**
   * Send response to MCP server
   */
  private sendResponse(id: string, result: any, error?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[MCP Client] Cannot send response: not connected');
      return;
    }

    const response: MCPResponse = {
      id,
      result,
      error,
    };

    this.ws.send(JSON.stringify(response));
  }

  /**
   * Disconnect from MCP server
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let mcpClientInstance: MCPClient | null = null;

/**
 * Initialize MCP client
 */
export function initializeMCPClient(): MCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient();
  }
  return mcpClientInstance;
}

/**
 * Get MCP client instance
 */
export function getMCPClient(): MCPClient | null {
  return mcpClientInstance;
}
