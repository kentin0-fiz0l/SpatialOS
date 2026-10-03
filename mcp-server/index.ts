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
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_NOT_CONNECTED,
  CLOSE_CODES,
  isAllowedOrigin,
  tokenMatches,
  validateImageUrl,
} from './lib.js';

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

// The browser must present this token. It's written to a file the Vite dev server reads
// and serves to the page (loopback only), so neither side needs configuration and a
// restart of either just works. MCP_AUTH_TOKEN pins it; MCP_TOKEN_FILE moves the file.
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || randomBytes(24).toString('base64url');
const TOKEN_FILE =
  process.env.MCP_TOKEN_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.mcp-token');
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
  {
    name: 'delegate_to_agent',
    description:
      'Hand a task to the personal agent, which works on its own in the background: web research, ' +
      'writing summaries, controlling home devices. Returns a run id at once; the result arrives later. ' +
      'Use for anything that takes more than a quick answer. The user watches progress on the activity ' +
      'panel and approves sensitive actions on their phone.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'What the agent should do, in full, as the user said it (e.g. "research how DNS rebinding works and write a one-page summary")',
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'agent_run_status',
    description: 'Check on an agent run started with delegate_to_agent: whether it finished and what it reported.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'The id returned by delegate_to_agent; omit for the most recent run' },
      },
    },
  },
];

// Agent runner (agent/runner.py), a host process on loopback.
const RUNNER_URL = process.env.AGENT_RUNNER_URL || 'http://127.0.0.1:8791';
const RUNNER_NOT_RUNNING = `Agent runner not reachable at ${RUNNER_URL}. Start it with: python3 agent/runner.py`;

async function runnerFetch(path: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${RUNNER_URL}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(RUNNER_NOT_RUNNING);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `runner returned ${res.status}`);
  return body;
}

interface RunInfo {
  id: string;
  goal: string;
  status: string;
  summary: string;
  output?: string;
}

function describeRun(run: RunInfo): string {
  if (run.status === 'running') return `Run ${run.id} is still working on: ${run.goal}`;
  // The agent's final message is the last block of text before the "stopped:" line.
  const lines = (run.output || '').split('\n');
  let stop = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].startsWith('stopped:')) { stop = i; break; }
  const report = lines.slice(0, stop).filter((l) => l.startsWith('  ') && !l.startsWith('  →') && !l.startsWith('  ·'));
  const tail = report.slice(-12).map((l) => l.trim()).join('\n');
  return `Run ${run.id} ${run.status} (${run.summary || 'no summary'}).\nGoal: ${run.goal}\n\nAgent's report:\n${tail || '(no report)'}`;
}

// Send command to browser via WebSocket
function sendToBrowser(command: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!browserClient || browserClient.readyState !== WebSocket.OPEN) {
      reject(new Error(BROWSER_NOT_CONNECTED));
      return;
    }

    // Capture socket reference to prevent listener leak on reconnect
    const client = browserClient;
    const messageId = uuidv4();
    const message = {
      id: messageId,
      ...command,
    };

    // Wait for response
    const timeout = setTimeout(() => {
      client.removeListener('message', responseHandler);
      reject(new Error('Browser not responding. Check the SpatialOS tab (http://localhost:5173) is open and not frozen, then try again.'));
    }, 5000);

    const responseHandler = (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === messageId) {
          clearTimeout(timeout);
          client.removeListener('message', responseHandler);
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

    client.on('message', responseHandler);
    client.send(JSON.stringify(message));
  });
}

// Initialize WebSocket server
function initWebSocketServer() {
  wsServer = new WebSocketServer({ port: WS_PORT, host: 'localhost' });

  wsServer.on('connection', (ws, req) => {
    // Only pages served from this machine may connect (browsers can't forge Origin).
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      console.error(`[MCP] Rejected connection from unauthorized origin: ${origin}`);
      ws.close(CLOSE_CODES.UNAUTHORIZED, 'Unauthorized origin');
      return;
    }

    const url = new URL(req.url || '', `http://localhost:${WS_PORT}`);
    if (!tokenMatches(url.searchParams.get('token'), AUTH_TOKEN)) {
      console.error('[MCP] Rejected connection with invalid token');
      ws.close(CLOSE_CODES.UNAUTHORIZED, 'Invalid auth token');
      return;
    }

    // One browser drives the scene. A distinct close code tells the old tab not to
    // reconnect; with a normal close the two tabs would evict each other every 2s.
    if (browserClient && browserClient.readyState === WebSocket.OPEN) {
      console.error('[MCP] Another tab connected; closing the previous one');
      browserClient.close(CLOSE_CODES.SUPERSEDED, 'Another SpatialOS tab took over');
    }

    console.error(`[MCP] Browser authenticated and connected`);
    browserClient = ws;

    ws.on('close', () => {
      console.error('[MCP] Browser disconnected');
      if (browserClient === ws) {
        browserClient = null;
      }
    });

    ws.on('error', (err) => {
      console.error('[MCP] WebSocket error:', err);
    });
  });

  wsServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[MCP] Port ${WS_PORT} is already in use. Please close any other instances of the MCP server or restart your system.`);
    } else {
      console.error('[MCP] WebSocket server error:', err.message || err);
    }
    process.exit(1);
  });

  // The token never goes to the log (voice-harness captures stderr). The file is how
  // the browser learns it; see the mcpToken plugin in vite.config.ts.
  mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  writeFileSync(TOKEN_FILE, AUTH_TOKEN, { mode: 0o600 });
  console.error(`[MCP] WebSocket server listening on ws://localhost:${WS_PORT}; token in ${TOKEN_FILE}`);
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

      case 'delegate_to_agent': {
        const goal = String((args as any).goal ?? '').trim();
        if (!goal) throw new Error('goal is required');
        const started = await runnerFetch('/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal }),
        });
        return {
          content: [{
            type: 'text',
            text: `Started agent run ${started.id}. It is working in the background; progress shows on the activity panel ` +
              `and anything sensitive will ask for approval on the phone. Check back with agent_run_status.`,
          }],
        };
      }

      case 'agent_run_status': {
        let runId = (args as any).run_id as string | undefined;
        if (!runId) {
          const { runs } = await runnerFetch('/runs');
          if (!runs.length) return { content: [{ type: 'text', text: 'No agent runs yet.' }] };
          runId = runs[0].id;
        }
        const run: RunInfo = await runnerFetch(`/runs/${encodeURIComponent(runId!)}`);
        return { content: [{ type: 'text', text: describeRun(run) }] };
      }

      case 'create_spatial_image': {
        const url = (args as any).url as string;
        validateImageUrl(url); // Prevent javascript:, file:, etc.
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
