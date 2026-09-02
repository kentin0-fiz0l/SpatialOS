#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

/**
 * SpatialOS MCP Server
 *
 * Bridges voice-harness (stdio) ↔ SpatialOS React app (WebSocket)
 *
 * Architecture:
 * - voice-harness spawns this as subprocess, communicates via stdio
 * - This server opens WebSocket server on localhost:8765
 * - React app connects to WebSocket
 * - When LLM calls a tool, we send command over WebSocket to React app
 */

// WebSocket server for browser connection
const WS_PORT = 8765;
let wsServer: WebSocketServer;
let browserClient: WebSocket | null = null;

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'create_spatial_note',
    description: 'Create a 3D text note floating in space at a specified location',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The text content of the note',
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Optional [x, y, z] position in room coordinates (meters). Defaults to in front of camera if omitted.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'create_spatial_timer',
    description: 'Create a countdown timer display in 3D space',
    inputSchema: {
      type: 'object',
      properties: {
        duration: {
          type: 'number',
          description: 'Duration in seconds (e.g., 300 for 5 minutes)',
        },
        label: {
          type: 'string',
          description: 'Optional label for the timer (e.g., "Pasta timer")',
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Optional [x, y, z] position in room coordinates',
        },
      },
      required: ['duration'],
    },
  },
  {
    name: 'create_spatial_image',
    description: 'Create an image display in 3D space',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Image URL or data URI (e.g., "https://example.com/image.jpg" or "data:image/png;base64,...")',
        },
        width: {
          type: 'number',
          description: 'Optional width in millimeters (defaults to 1000mm = 1m)',
        },
        height: {
          type: 'number',
          description: 'Optional height in millimeters (defaults to match aspect ratio)',
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Optional [x, y, z] position in room coordinates',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'create_spatial_widget',
    description: 'Create an interactive widget display in 3D space',
    inputSchema: {
      type: 'object',
      properties: {
        widgetType: {
          type: 'string',
          enum: ['calendar', 'weather', 'clock', 'todo'],
          description: 'Type of widget to create',
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Optional [x, y, z] position in room coordinates',
        },
      },
      required: ['widgetType'],
    },
  },
  {
    name: 'list_spatial_objects',
    description: 'List all spatial objects currently in the scene',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['note', 'timer', 'image', 'widget', 'tool'],
          description: 'Filter by object type (optional)',
        },
      },
    },
  },
  {
    name: 'delete_spatial_object',
    description: 'Remove a spatial object from the scene',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique ID of the object to delete',
        },
      },
      required: ['id'],
    },
  },
];

// Send command to browser via WebSocket
function sendToBrowser(command: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!browserClient || browserClient.readyState !== WebSocket.OPEN) {
      reject(new Error('Browser not connected. Please open the SpatialOS app in your browser.'));
      return;
    }

    const messageId = uuidv4();
    const message = {
      id: messageId,
      ...command,
    };

    // Wait for response
    const timeout = setTimeout(() => {
      reject(new Error('Browser response timeout'));
    }, 5000);

    const responseHandler = (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === messageId) {
          clearTimeout(timeout);
          browserClient?.removeListener('message', responseHandler);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result);
          }
        }
      } catch (err) {
        // Ignore parse errors for other messages
      }
    };

    browserClient.on('message', responseHandler);
    browserClient.send(JSON.stringify(message));
  });
}

// Initialize WebSocket server
function initWebSocketServer() {
  wsServer = new WebSocketServer({ port: WS_PORT });

  wsServer.on('connection', (ws) => {
    console.error(`[MCP] Browser connected to WebSocket on port ${WS_PORT}`);
    browserClient = ws;

    ws.on('close', () => {
      console.error('[MCP] Browser disconnected');
      browserClient = null;
    });

    ws.on('error', (err) => {
      console.error('[MCP] WebSocket error:', err);
    });
  });

  console.error(`[MCP] WebSocket server listening on ws://localhost:${WS_PORT}`);
}

// Initialize MCP server
const server = new Server(
  {
    name: 'spatialos-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error('Missing arguments');
  }

  try {
    switch (name) {
      case 'create_spatial_note': {
        const result = await sendToBrowser({
          type: 'createObject',
          objectType: 'note',
          content: { text: (args as any).content },
          position: (args as any).position,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Created note: "${(args as any).content}" (ID: ${result.id})`,
            },
          ],
        };
      }

      case 'create_spatial_timer': {
        const duration = (args as any).duration as number;
        const result = await sendToBrowser({
          type: 'createObject',
          objectType: 'timer',
          content: {
            duration,
            label: (args as any).label,
            startTime: Date.now(), // Start countdown immediately
            remainingTime: duration,
          },
          position: (args as any).position,
        });
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        const label = (args as any).label;
        return {
          content: [
            {
              type: 'text',
              text: `Created timer: ${timeStr}${label ? ` - ${label}` : ''} (ID: ${result.id})`,
            },
          ],
        };
      }

      case 'create_spatial_image': {
        const url = (args as any).url as string;
        const result = await sendToBrowser({
          type: 'createObject',
          objectType: 'image',
          content: {
            url,
            width: (args as any).width,
            height: (args as any).height,
          },
          position: (args as any).position,
        });
        // Extract filename from URL
        const filename = url.split('/').pop()?.split('?')[0] || 'image';
        return {
          content: [
            {
              type: 'text',
              text: `Created image: "${filename}" (ID: ${result.id})`,
            },
          ],
        };
      }

      case 'create_spatial_widget': {
        const widgetType = (args as any).widgetType as string;
        const result = await sendToBrowser({
          type: 'createObject',
          objectType: 'widget',
          content: {
            widgetType,
          },
          position: (args as any).position,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Created ${widgetType} widget (ID: ${result.id})`,
            },
          ],
        };
      }

      case 'list_spatial_objects': {
        const typeFilter = (args as any).type;
        const result = await sendToBrowser({
          type: 'listObjects',
          filter: typeFilter ? { type: typeFilter } : undefined,
        });
        const objects = result.objects || [];
        if (objects.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No spatial objects in the scene.',
              },
            ],
          };
        }
        const list = objects
          .map((obj: any) => `- ${obj.type}: ${obj.id} (${obj.content?.text || obj.content?.label || 'untitled'})`)
          .join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `Spatial objects (${objects.length}):\n${list}`,
            },
          ],
        };
      }

      case 'delete_spatial_object': {
        const objId = (args as any).id as string;
        await sendToBrowser({
          type: 'deleteObject',
          objectId: objId,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Deleted object: ${objId}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start servers
async function main() {
  initWebSocketServer();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP] SpatialOS MCP server started');
  console.error('[MCP] Waiting for browser connection on ws://localhost:8765');
}

main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
