# SpatialOS Architecture Design

## Overview

SpatialOS combines voice-harness (voice assistant) + HandTrack3D (3D hand tracking) + WiFi positioning to create a spatial computing interface. Users create objects with voice, manipulate them with hand gestures, and objects persist in room coordinates.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SpatialOS Web App                             │
│                   (React 19 + TypeScript + Vite)                     │
└─────────────────────────────────────────────────────────────────────┘
     │                          │                          │
     ↓                          ↓                          ↓
┌──────────────┐      ┌──────────────────┐      ┌───────────────────┐
│ Voice Module │      │  3D Scene Module │      │  Persistence      │
│              │      │                  │      │  Module           │
│ voice-harness│◄────►│  HandTrack3D     │◄────►│  Zustand Store    │
│ (subprocess) │      │  (React comp)    │      │  + localStorage   │
└──────────────┘      └──────────────────┘      └───────────────────┘
     │                          │                          │
     └──────────────────────────┴──────────────────────────┘
                                │
                    ┌───────────────────────┐
                    │   MCP Command Server  │
                    │   (stdio transport)   │
                    └───────────────────────┘
```

## Component Details

### 1. Voice Module (voice-harness)

**Purpose**: Natural language interface for creating and commanding spatial objects.

**Implementation**:
- Runs as a **child process** spawned from the React app
- Communicates via **stdio MCP transport**
- Uses spatial assistant persona (optimized for spatial commands)
- Streams audio input → STT → LLM → TTS

**Voice Commands**:
```
"Create a note [content]"           → create_spatial_note(content)
"Set a timer for [duration]"        → create_spatial_timer(duration)
"Show me all objects"               → list_spatial_objects()
"Delete that note"                  → delete_spatial_object(id)
"Move that object to the desk"      → move_spatial_object(id, location)
```

**Configuration**:
```typescript
// voice-harness config
{
  llmEngine: "ollama",
  model: "llama3.1:8b",
  persona: "spatial",  // Custom persona for spatial commands
  mcpConfig: "~/.spatialos/mcp.json",
  inputMode: "ptt"  // or "vad" for hands-free
}
```

### 2. 3D Scene Module (HandTrack3D)

**Purpose**: Render spatial objects and enable hand gesture manipulation.

**Implementation**:
- React component using **@handtrack3d/** packages
- Three.js rendering via React Three Fiber
- MediaPipe hand tracking (30fps)
- Rapier physics engine
- WiFi positioning via companion app

**Gesture Interactions**:
- **Pinch** (thumb + index) → Grab object
- **Drag** → Move object in 3D space
- **Open hand** → Release object
- **Swipe** → Dismiss object (delete)
- **Point** → Select object (future: context menu)

**3D Object Types**:
```typescript
type SpatialObjectType = 
  | 'note'      // Text panel
  | 'timer'     // Countdown display
  | 'image'     // Photo/screenshot
  | 'widget'    // Calendar, weather, etc.
  | 'tool';     // Terminal, browser, etc.
```

### 3. Persistence Module (Zustand Store)

**Purpose**: Shared state between voice and hand systems, with room-coordinate persistence.

**State Schema**:
```typescript
interface SpatialObject {
  id: string;                    // UUID
  type: SpatialObjectType;
  content: {
    text?: string;               // For notes
    duration?: number;           // For timers (seconds)
    url?: string;                // For images/tools
    data?: any;                  // Custom data
  };
  
  // 3D Transform (room coordinates)
  position: [number, number, number];  // [x, y, z] in meters
  rotation: [number, number, number, number]; // Quaternion [x, y, z, w]
  scale: [number, number, number];     // [x, y, z] scale factors
  
  // Metadata
  room: string;                  // Room ID (from WiFi positioning)
  createdAt: number;             // Unix timestamp
  createdBy: 'voice' | 'hand';   // Creation source
  persistent: boolean;           // Save to disk?
  visible: boolean;              // Render in scene?
}

interface SpatialStore {
  objects: Map<string, SpatialObject>;
  
  // Actions
  addObject: (obj: Omit<SpatialObject, 'id'>) => string;
  updateObject: (id: string, updates: Partial<SpatialObject>) => void;
  deleteObject: (id: string) => void;
  getObject: (id: string) => SpatialObject | undefined;
  getAllObjects: () => SpatialObject[];
  getObjectsByRoom: (room: string) => SpatialObject[];
  
  // Persistence
  loadFromDisk: () => void;
  saveToDisk: () => void;
}
```

**Storage Backend**:
- **localStorage** for MVP (simple, fast, client-side)
- **Future**: IndexedDB for larger datasets, or remote DB for multi-device sync

### 4. MCP Command Server

**Purpose**: Bridge between voice-harness and the SpatialOS app.

**Implementation**:
- Node.js MCP server using `@modelcontextprotocol/sdk`
- **stdio transport** (voice-harness spawns it as a subprocess)
- Tools exposed to LLM for spatial commands

**MCP Tools**:

```typescript
// Tool 1: Create Note
{
  name: "create_spatial_note",
  description: "Create a 3D text note at a location in space",
  parameters: {
    content: string,      // Note text
    position?: [x, y, z]  // Optional position (defaults to in front of camera)
  }
}

// Tool 2: Create Timer
{
  name: "create_spatial_timer",
  description: "Create a countdown timer display",
  parameters: {
    duration: number,     // Seconds
    label?: string,       // Optional label (e.g., "Pasta timer")
    position?: [x, y, z]
  }
}

// Tool 3: List Objects
{
  name: "list_spatial_objects",
  description: "Get all spatial objects in the current room",
  parameters: {
    type?: SpatialObjectType  // Filter by type
  }
}

// Tool 4: Delete Object
{
  name: "delete_spatial_object",
  description: "Remove a spatial object",
  parameters: {
    id: string  // Object ID
  }
}
```

**Communication Flow**:
```
Voice: "Create a note hello world"
  ↓ (STT)
LLM: create_spatial_note({content: "hello world"})
  ↓ (MCP call)
MCP Server: Emits event to SpatialStore
  ↓
SpatialStore: addObject({type: 'note', content: {text: "hello world"}, ...})
  ↓
3D Scene: Subscribes to store, renders new TextPanel component
  ↓
User sees: 3D text "hello world" floating in space
```

## Data Flow

### Voice → 3D (Object Creation)

```
User speaks ──► voice-harness ──► STT ──► LLM ──► Tool call ──► MCP Server
                                                                    │
                                                                    ↓
     3D Scene ◄── React re-render ◄── Zustand notify ◄── Store.addObject()
```

### Hand → Store (Object Manipulation)

```
Hand gesture (pinch) ──► GestureDetector ──► GrabPlugin ──► Object grabbed
                                                                 │
                                                                 ↓
Hand moves ──► 3D cursor updates ──► Object position updates ──► Store.updateObject()
                                                                      │
                                                                      ↓
                                            localStorage save (debounced)
```

### Persistence → 3D (Page Load)

```
App starts ──► Store.loadFromDisk() ──► Parse localStorage ──► objects[] populated
                                                                      │
                                                                      ↓
                                        3D Scene renders all objects in room coords
```

## Coordinate Systems

### Challenge
- **MediaPipe**: Camera-relative coordinates (2D landmarks + depth)
- **WiFi**: Room-relative coordinates (X, Y, Z in meters from room origin)
- **HandTrack3D**: 3D scene coordinates (arbitrary units)

### Solution: Room Coordinate System

All object positions stored in **WiFi room coordinates**:
- Origin (0, 0, 0) = Room origin marker
- X-axis = Right (red arrow)
- Y-axis = Up (green arrow)
- Z-axis = Forward (blue arrow)
- Units = meters

**Conversion Flow**:
```typescript
// Hand tracking gives camera-relative position
const cameraPos = mapHandTo3D(landmarks); // HandTrack3D utility

// Convert to room coordinates via sensor fusion
const roomPos = sensorFusionService.fusePosition(
  cameraPos,           // High-freq, low-accuracy (±1cm camera-relative)
  wifiPos,             // Low-freq, high-accuracy (±2-5m room-absolute)
  cameraPose           // Camera's position in room (from WiFi)
);

// Store in room coordinates
store.updateObject(objId, { position: roomPos });
```

**Why This Matters**:
- Objects **persist** in room locations, not camera locations
- Walk around the room → objects stay in place
- Restart app → objects appear where you left them
- Multiple cameras/devices → see same objects (future)

## Project Structure

```
SpatialOS/
├── docs/
│   ├── ARCHITECTURE.md          # This file
│   └── API.md                   # API reference (future)
├── src/
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Root component
│   ├── components/
│   │   ├── Scene3D/             # HandTrack3D scene
│   │   │   ├── Scene3D.tsx      # Main 3D canvas
│   │   │   ├── SpatialNote.tsx  # 3D text note component
│   │   │   ├── SpatialTimer.tsx # 3D timer component
│   │   │   └── HandCursor.tsx   # Hand visualization
│   │   ├── VoiceControl/        # Voice interface
│   │   │   ├── VoiceService.tsx # voice-harness integration
│   │   │   └── VoiceStatus.tsx  # Mic status, transcription display
│   │   └── UI/                  # 2D overlay UI
│   │       ├── ControlPanel.tsx # Settings, debug info
│   │       └── ObjectList.tsx   # List of spatial objects
│   ├── services/
│   │   ├── voiceService.ts      # voice-harness process manager
│   │   ├── mcpServer.ts         # MCP server manager
│   │   └── sensorFusion.ts      # WiFi + camera fusion
│   ├── stores/
│   │   ├── spatialStore.ts      # Main spatial object store
│   │   ├── voiceStore.ts        # Voice status, transcription
│   │   └── handStore.ts         # Hand tracking state
│   ├── types/
│   │   ├── spatial.types.ts     # SpatialObject, etc.
│   │   └── mcp.types.ts         # MCP tool schemas
│   └── utils/
│       ├── coordinates.ts       # Coordinate conversions
│       └── persistence.ts       # localStorage helpers
├── mcp-server/                  # MCP command server
│   ├── index.ts                 # Server entry point
│   ├── tools/                   # Tool implementations
│   │   ├── createNote.ts
│   │   ├── createTimer.ts
│   │   ├── listObjects.ts
│   │   └── deleteObject.ts
│   └── package.json
├── voice-config/                # voice-harness configuration
│   ├── mcp.json                 # MCP server config
│   └── spatial-persona.txt      # Custom persona prompt
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Technology Stack

### Frontend
- **React 19** - UI framework
- **TypeScript 6** - Type safety
- **Vite 8** - Build tool
- **Zustand** - State management
- **@handtrack3d/** packages - 3D hand tracking
- **Three.js / R3F** - 3D rendering

### Voice
- **voice-harness** - Voice assistant framework
- **faster-whisper** - Local STT
- **Ollama** - Local LLM (llama3.1:8b)
- **macOS say** - TTS (or Piper on Linux)

### MCP
- **@modelcontextprotocol/sdk** - MCP server/client
- **Node.js** - Runtime for MCP server

### Positioning
- **WiFi companion app** - WebSocket server for WiFi RSSI
- **Kalman filter** - Sensor fusion algorithm
- **MediaPipe** - Camera pose estimation

## Development Workflow

### Starting the App

```bash
# Terminal 1: Start WiFi companion (for positioning)
cd tools/wifi-companion
npm start

# Terminal 2: Start SpatialOS app (includes MCP server + voice-harness)
cd ~/Projects/Active/SpatialOS
pnpm dev
```

### First-Time Setup

1. **Calibrate WiFi routers** (Settings → Positioning → Calibrate)
   - Add 3+ router positions in room coordinates
   
2. **Configure voice-harness**
   - Test microphone (`voice-harness --list-devices`)
   - Choose input mode (PTT recommended for MVP)
   
3. **Test hand tracking**
   - Allow webcam access
   - Show hand to camera, verify cursor appears

### Testing Flow

**Test 1: Voice creates note**
```
1. Hold spacebar (PTT mode)
2. Say: "Create a note hello world"
3. Release spacebar
4. Verify: 3D text "hello world" appears in scene
```

**Test 2: Hand manipulates note**
```
1. Show hand to webcam
2. Pinch near the note (thumb + index)
3. Move hand
4. Verify: Note follows hand
5. Open hand (spread fingers)
6. Verify: Note drops
```

**Test 3: Position persistence**
```
1. Create note with voice
2. Move note with hand to a specific location
3. Refresh browser page
4. Verify: Note reappears in same room location
```

## Performance Targets

- **Hand tracking**: 30fps
- **3D rendering**: 60fps
- **Voice latency**: <500ms (STT) + <2s (LLM) + <200ms (TTS)
- **WiFi positioning**: 2Hz update rate
- **Sensor fusion**: 30Hz (matches hand tracking)
- **Persistence**: <100ms save to localStorage (debounced)

## Future Extensions (Post-MVP)

### Phase 2: Rich Content
- Image objects (photos, screenshots)
- Web content (embedded iframe)
- Code snippets (syntax highlighted)

### Phase 3: Multi-Room
- Room detection (WiFi fingerprinting)
- Per-room object filtering
- Spatial triggers ("when I enter office, show tasks")

### Phase 4: Collaboration
- Multi-user positioning (track multiple people)
- Shared objects (real-time sync)
- Voice attribution (color-coded per person)

## Security & Privacy

- **Local-first**: All data stored locally (no cloud by default)
- **No telemetry**: No tracking or analytics
- **Webcam**: Used only for hand tracking, no recording
- **Microphone**: Used only for voice input, no recording
- **WiFi**: Only RSSI data (signal strength), no network traffic sniffing

## Known Limitations (MVP)

- **Single room**: No multi-room support yet
- **Single user**: No collaboration features
- **2D text only**: No images, videos, or rich content
- **Browser-based**: Not a native app (performance constraints)
- **WiFi required**: Need WiFi companion app for positioning
- **No mobile**: Desktop/laptop only (requires webcam)

---

**Last Updated**: 2026-09-01  
**Version**: 0.1.0-alpha (Phase 1 MVP)
