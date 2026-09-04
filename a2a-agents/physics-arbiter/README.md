# Physics Arbiter Agent

Service agent that validates object placements and detects collisions in multi-user spatial computing scenarios.

## Capabilities

- **collision-check**: Check if an object would collide with existing objects
- **placement-validate**: Validate object placement (bounds check + collision check)

## How It Works

The Physics Arbiter:
1. Connects to the A2A discovery server
2. Registers itself with `collision-check` and `placement-validate` capabilities
3. Listens to `object-created` and `object-deleted` events to maintain an object registry
4. Responds to validation requests from user agents

## Installation

```bash
cd a2a-agents/physics-arbiter
pnpm install
```

## Usage

### Start the Agent

```bash
pnpm start
```

Or in development mode with auto-reload:

```bash
pnpm dev
```

### Query from User Agent

```typescript
import { a2aService } from './services/a2aService';

// Discover physics arbiter
const arbiters = await a2aService.discover({
  capabilities: ['placement-validate']
});

const arbiter = arbiters[0];
const requestId = crypto.randomUUID();

// Request placement validation
a2aService.sendMessage({
  to: arbiter.id,
  type: 'placement-validate',
  payload: {
    object: {
      id: 'my-object',
      type: 'note',
      position: [0, 1, -2],
    },
    requestId,
  },
});

// Listen for response
a2aService.onMessage('placement-validate-result', (message) => {
  if (message.payload.requestId === requestId) {
    console.log('Valid placement:', message.payload.isValid);
    console.log('Reason:', message.payload.reason);
  }
});
```

## Configuration

Default configuration:

```typescript
{
  bounds: {
    minX: -5, maxX: 5,
    minY: 0, maxY: 3,
    minZ: -5, maxZ: 0,
  },
  minObjectDistance: 0.3,  // 30cm minimum spacing
  defaultObjectRadius: 0.15, // 15cm default radius
}
```

To customize, modify the config in `src/index.ts`.

## Architecture

```
PhysicsArbiter
├── PhysicsEngine      → Bounds validation
├── CollisionDetector  → Collision detection
└── A2AClient         → Discovery & messaging
```

## Message Protocol

### Requests

**collision-check**
```json
{
  "type": "collision-check",
  "payload": {
    "object": { "id": "...", "position": [x, y, z] },
    "requestId": "uuid"
  }
}
```

**placement-validate**
```json
{
  "type": "placement-validate",
  "payload": {
    "object": { "id": "...", "position": [x, y, z] },
    "requestId": "uuid"
  }
}
```

### Responses

**collision-check-result**
```json
{
  "type": "collision-check-result",
  "payload": {
    "hasCollision": true,
    "collisions": [
      { "objectId": "...", "distance": 0.2, "overlap": 0.1 }
    ],
    "requestId": "uuid"
  }
}
```

**placement-validate-result**
```json
{
  "type": "placement-validate-result",
  "payload": {
    "isValid": false,
    "reason": "Collision with 1 object(s)",
    "collisions": [...],
    "requestId": "uuid"
  }
}
```

## Testing

Run tests:

```bash
pnpm test
```

## License

MIT
