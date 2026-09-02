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
1. Start WebSocket server on `ws://localhost:8765`
2. Wait for browser connection
3. Listen for MCP tool calls on stdin

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

## Ports

- **WebSocket**: `localhost:8765` - Browser connection
- **stdio**: MCP transport for voice-harness

## Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `ws` - WebSocket server
- `uuid` - Message ID generation
