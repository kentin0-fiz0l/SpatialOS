# SpatialOS MCP Server

MCP server that bridges voice-harness (voice commands) to the SpatialOS React app (3D scene).

## Architecture

```
voice-harness (subprocess)
     ↓ stdio
MCP Server (this)
     ↓ WebSocket (localhost:8765)
SpatialOS React App (browser)
     ↓ Zustand store
3D Scene (Three.js + HandTrack3D)
```

## Tools Exposed

### 1. create_spatial_note
Creates a 3D text note in space.

**Parameters:**
- `content` (string, required): Note text
- `position` ([x, y, z], optional): Position in room coordinates (meters)

**Example:**
```
User: "Create a note about the meeting"
LLM: create_spatial_note({content: "meeting at 2pm"})
```

### 2. create_spatial_timer
Creates a countdown timer display.

**Parameters:**
- `duration` (number, required): Duration in seconds
- `label` (string, optional): Timer label
- `position` ([x, y, z], optional): Position in room coordinates

**Example:**
```
User: "Set a timer for 5 minutes for the pasta"
LLM: create_spatial_timer({duration: 300, label: "pasta"})
```

### 3. list_spatial_objects
Lists all spatial objects in the scene.

**Parameters:**
- `type` (string, optional): Filter by type ('note', 'timer', etc.)

### 4. delete_spatial_object
Removes a spatial object.

**Parameters:**
- `id` (string, required): Object ID to delete

## Usage

### Running Standalone (for testing)

```bash
cd mcp-server
pnpm build
node index.js
```

The server will:
1. Start WebSocket server on `ws://localhost:8765` (loopback only)
2. Write its connection token to `mcp-server/.mcp-token` (gitignored, mode 600)
3. Wait for browser connection
4. Listen for MCP tool calls on stdin

### How the browser authenticates

The WebSocket only accepts pages served from this machine (`Origin` must be a loopback
host) that present the token. No configuration is needed: the server writes the token to
`.mcp-token` on start, the Vite dev server serves it at `/mcp-token` to loopback callers
(see `mcpToken()` in `vite.config.ts`), and the page fetches it before connecting. Restart
either side and they re-pair. `MCP_AUTH_TOKEN` pins the token and `MCP_TOKEN_FILE` moves
the file; the token is never printed to the log.

One tab drives the scene. Opening a second tab takes over; the first stays disconnected
until reloaded.

### Running with voice-harness

voice-harness spawns this server automatically when configured in `mcp.json`:

```json
{
  "mcpServers": {
    "spatialos": {
      "command": "node",
      "args": ["../mcp-server/index.js"]
    }
  }
}
```

## Development

### Build

```bash
pnpm build      # Compile TypeScript
```

### Watch mode

```bash
pnpm watch      # Auto-rebuild on changes
```

## Communication Protocol

### Browser → Server (Response)

```json
{
  "id": "message-uuid",
  "result": { "id": "object-123" }
}
```

### Server → Browser (Command)

```json
{
  "id": "message-uuid",
  "type": "createObject",
  "objectType": "note",
  "content": { "text": "hello world" },
  "position": [0, 1.5, -2]
}
```

## Agent tools

`delegate_to_agent(goal)` hands a task to the personal agent (`agent/`) through the runner
(`python3 agent/runner.py`, loopback `:8791`, override with `AGENT_RUNNER_URL`). It returns
at once with a run id; `agent_run_status(run_id?)` reports whether the run finished and what
the agent said. Progress shows on the SpatialOS activity panel; sensitive actions are held by
the watchdog for approval on the phone.

## Ports

- **WebSocket**: `localhost:8765` - Browser connection (the watchdog's approval server uses 8790)
- **stdio**: MCP transport for voice-harness

## Tests

```bash
cd mcp-server && npm test
```

## Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `ws` - WebSocket server
- `uuid` - Message ID generation
