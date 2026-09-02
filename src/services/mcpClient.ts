/**
 * MCP Client Service
 *
 * Connects browser to MCP server via WebSocket
 * Handles voice commands → spatial object creation
 */

import type { MCPCommand, MCPResponse, SpatialObjectContent } from '../types/spatial.types';
import { useSpatialStore } from '../stores/spatialStore';
import { usePositioningStore } from '../stores/positioningStore';

const WS_URL = 'ws://localhost:8765';
const RECONNECT_DELAY = 2000; // 2 seconds

export class MCPClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;

  constructor() {
    this.connect();
  }

  /**
   * Connect to MCP server WebSocket
   */
  connect() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[MCP Client] Connected to MCP server');
        this.isConnected = true;

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onclose = () => {
        console.log('[MCP Client] Disconnected from MCP server');
        this.isConnected = false;
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
      console.log('[MCP Client] Attempting to reconnect...');
      this.connect();
    }, RECONNECT_DELAY);
  }

  /**
   * Handle incoming message from MCP server
   */
  private handleMessage(data: string) {
    try {
      const command: MCPCommand = JSON.parse(data);
      console.log('[MCP Client] Received command:', command.type);

      // Handle command and send response
      const result = this.handleCommand(command);
      this.sendResponse(command.id, result);
    } catch (error) {
      console.error('[MCP Client] Failed to handle message:', error);
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
  private sendResponse(id: string, result: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[MCP Client] Cannot send response: not connected');
      return;
    }

    const response: MCPResponse = {
      id,
      result,
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
