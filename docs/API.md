# SpatialOS MCP API Reference

MCP (Model Context Protocol) server exposes spatial object creation and management tools via WebSocket (localhost:8765).

## Voice Command Tools

### create_spatial_note

Creates a 3D text panel that floats in space.

**Parameters:**
- `text` (string, required) - The note content to display
- `position` (Vector3, optional) - 3D position `[x, y, z]` in meters (default: `[0, 1.5, -2]`)

**Example Usage:**
```json
{
  "type": "createObject",
  "objectType": "note",
  "content": { "text": "Hello World" },
  "position": [0, 1.5, -2]
}
```

**Returns:**
```json
{
  "success": true,
  "objectId": "uuid-string",
  "type": "note"
}
```

**Voice Trigger:** *"Create a note [text]"*

---

### create_spatial_timer

Creates a countdown timer with circular progress ring and alert on completion.

**Parameters:**
- `duration` (number, required) - Timer duration in seconds
- `label` (string, optional) - Display label for the timer
- `position` (Vector3, optional) - 3D position `[x, y, z]` (default: `[0, 1.5, -2]`)

**Example Usage:**
```json
{
  "type": "createObject",
  "objectType": "timer",
  "content": {
    "duration": 300,
    "label": "Coffee Break",
    "startTime": 1693834800000
  },
  "position": [0, 1.5, -2]
}
```

**Returns:**
```json
{
  "success": true,
  "objectId": "uuid-string",
  "type": "timer"
}
```

**Features:**
- Real-time countdown display (MM:SS)
- Color-coded progress (green → orange → red)
- Circular progress ring shrinks as time runs out
- Audio alert on completion (800Hz sine wave)
- Pulsing animation when timer completes

**Voice Trigger:** *"Set a timer for [duration]"*

---

### create_spatial_image

Displays an image in a 3D frame with dark border.

**Parameters:**
- `url` (string, required) - Image URL (HTTPS recommended)
- `width` (number, optional) - Display width in pixels (default: calculated from image)
- `height` (number, optional) - Display height in pixels (default: calculated from image)
- `position` (Vector3, optional) - 3D position (default: `[0, 1.5, -2]`)

**Example Usage:**
```json
{
  "type": "createObject",
  "objectType": "image",
  "content": {
    "url": "https://example.com/image.jpg",
    "width": 512,
    "height": 512
  },
  "position": [0, 1.5, -2]
}
```

**Returns:**
```json
{
  "success": true,
  "objectId": "uuid-string",
  "type": "image"
}
```

**Features:**
- Async texture loading with Three.js TextureLoader
- Dark frame border (`#1f2937`)
- "Loading..." placeholder during load
- Maintains aspect ratio
- Size normalized to 3D space (pixels/1000 = meters)

**Voice Trigger:** *"Show me an image [URL]"*

---

### create_spatial_widget

Creates interactive widget panels (clock, weather, calendar, todo list).

**Parameters:**
- `widgetType` (string, required) - Widget type: `"clock"`, `"weather"`, `"calendar"`, or `"todo"`
- `position` (Vector3, optional) - 3D position (default: `[0, 1.5, -2]`)

**Example Usage:**
```json
{
  "type": "createObject",
  "objectType": "widget",
  "content": {
    "widgetType": "clock"
  },
  "position": [0, 1.5, -2]
}
```

**Returns:**
```json
{
  "success": true,
  "objectId": "uuid-string",
  "type": "widget",
  "widgetType": "clock"
}
```

**Widget Types:**

**1. Clock** (`"clock"`)
- Real-time display (HH:MM:SS)
- Updates every second via `useFrame`
- Shows current date below time

**2. Weather** (`"weather"`)  
- Currently shows placeholder data:
  ```
  ⛅ 72°F
  San Francisco, CA
  Partly Cloudy
  ```
- *Future: Integrate live weather API*

**3. Calendar** (`"calendar"`)
- Currently shows placeholder events:
  ```
  📅 Today's Events
  9:00 AM - Team Standup
  2:00 PM - Design Review
  ```
- *Future: Integrate calendar API*

**4. Todo** (`"todo"`)
- Currently shows placeholder tasks:
  ```
  ✅ Review PR #123
  ⏳ Update docs
  ⏳ Ship v0.5
  ```
- *Future: Interactive checkboxes + persistence*

**Voice Trigger:** *"Create a widget [type]"*

---

### list_spatial_objects

Lists all spatial objects in the current room, optionally filtered by type.

**Parameters:**
- `type` (string, optional) - Filter by object type (`"note"`, `"timer"`, `"image"`, `"widget"`)

**Example Usage:**
```json
{
  "type": "listObjects",
  "filter": { "type": "note" }
}
```

**Returns:**
```json
{
  "success": true,
  "objects": [
    {
      "id": "uuid-1",
      "type": "note",
      "content": { "text": "Hello" },
      "position": [0, 1.5, -2],
      "createdAt": 1693834800000
    },
    {
      "id": "uuid-2",
      "type": "timer",
      "content": { "duration": 300, "label": "Coffee" },
      "position": [1, 1.5, -2],
      "createdAt": 1693834900000
    }
  ],
  "count": 2
}
```

**Voice Trigger:** *"Show me all objects"* or *"List my notes"*

---

### delete_spatial_object

Removes a spatial object by ID.

**Parameters:**
- `id` (string, required) - Object UUID to delete

**Example Usage:**
```json
{
  "type": "deleteObject",
  "objectId": "uuid-string"
}
```

**Returns:**
```json
{
  "success": true,
  "deletedId": "uuid-string"
}
```

**Voice Trigger:** *"Delete that note"* or *"Remove object [ID]"*

---

## Data Types

### Vector3
3D position vector as array: `[x, y, z]`
- Units: meters
- Example: `[0, 1.5, -2]` = center, 1.5m high, 2m in front of camera

### SpatialObject
```typescript
interface SpatialObject {
  id: string;                    // UUID
  type: 'note' | 'timer' | 'image' | 'widget' | 'tool';
  content: object;               // Type-specific content
  position: Vector3;             // [x, y, z] in meters
  rotation?: Vector4;            // Quaternion [x, y, z, w]
  scale?: Vector3;               // [x, y, z] scale factors
  room: string;                  // Room ID (default: "default")
  persistent: boolean;           // Save to localStorage (default: true)
  visible: boolean;              // Render in scene (default: true)
  createdAt: number;             // Unix timestamp (ms)
  throwVelocity?: Vector3;       // Applied as physics impulse when set
}
```

---

## Connection

**WebSocket URL:** `ws://localhost:8765`

**Message Format:**
```json
{
  "type": "createObject" | "deleteObject" | "listObjects",
  // ... tool-specific fields
}
```

**Auto-Reconnect:** Client reconnects automatically every 2 seconds if disconnected.

**Status Indicator:** StatusBar shows MCP connection status (green dot = connected).

---

## Error Handling

**Errors return:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common Errors:**
- `"Object not found"` - Invalid ID passed to delete
- `"Invalid object type"` - Unsupported type in createObject
- `"Missing required field"` - Required parameter not provided

---

## Notes

- All objects have physics (Rapier RigidBody) and can be grabbed/thrown with hand gestures
- Objects persist to `localStorage` and survive browser refresh
- Position coordinates are relative to camera origin (sensor fusion can map to room coordinates)
- Throw velocity is calculated from hand motion and applied as physics impulse on release

---

**Version:** v0.5.0-alpha  
**Last Updated:** 2026-09-02
