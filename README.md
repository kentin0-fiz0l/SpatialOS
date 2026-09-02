# SpatialOS

**Spatial Computing Interface • Phase 1 MVP Complete**

> Voice commands + 3D scene + Hand tracking + WiFi positioning

SpatialOS is a webcam-based spatial computing platform that lets you create and interact with 3D objects using natural language and gestures.

## What You Can Do

### ✨ Voice Commands
- **"Create a note [text]"** → Blue 3D text panel appears
- **"Set a timer for [duration]"** → Green countdown display appears
- **"Show me an image [URL]"** → Displays image in 3D frame
- **"Create a widget [type]"** → Interactive panel (clock, weather, calendar, todo)
- **"Show me all objects"** → Lists your spatial objects
- **"Delete that [object]"** → Removes an object

### 🎯 3D Interaction
- **Physics simulation** → Objects fall, collide, can be thrown
- **Camera controls** → Rotate, pan, zoom to view from any angle
- **Persistent objects** → Refresh browser, objects stay where you left them

### 📍 Room Positioning (Optional)
- **WiFi trilateration** → Objects positioned in real room coordinates (±2-5m)
- **Sensor fusion ready** → Combine WiFi + camera for ±1-2cm accuracy (future)

Think: **Vision Pro meets Jarvis**, using just a webcam + microphone + WiFi.

## Tech Stack

- **Voice**: voice-harness (local LLM + STT + TTS)
- **Hand Tracking**: HandTrack3D (MediaPipe + Three.js + Rapier physics)
- **Positioning**: WiFi trilateration + sensor fusion (±1-2cm accuracy)
- **State**: Zustand + localStorage persistence

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Webcam (for hand tracking)
- Microphone (for voice input)
- WiFi companion app running (for positioning)

### Installation

```bash
cd ~/Projects/Active/SpatialOS

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Navigate to **http://localhost:5173**

### First-Time Setup

1. **Allow webcam access** when prompted
2. **Allow microphone access** when prompted
3. **Start WiFi companion** (in a separate terminal):
   ```bash
   cd tools/wifi-companion
   npm start
   ```
4. **Calibrate WiFi routers** (Settings → Positioning → Calibrate)
   - Add 3+ router positions in room coordinates

## Usage

### Voice Commands (MVP)

Hold **spacebar** (PTT mode), then speak:

- `"Create a note [content]"` - Creates a 3D text note
- `"Set a timer for [duration]"` - Creates a countdown timer
- `"Show me all objects"` - Lists spatial objects
- `"Delete that note"` - Removes an object

### Hand Gestures

- **Pinch** (thumb + index finger) → Grab object
- **Drag** → Move object in 3D space
- **Open hand** (spread all fingers) → Release object

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `H` | Toggle status bar |
| `S` | Open settings |
| `W` | Toggle WiFi positioning status |
| `ESC` | Quit voice mode |

## Project Structure

```
SpatialOS/
├── docs/
│   └── ARCHITECTURE.md          # System architecture
├── src/
│   ├── components/
│   │   ├── Scene3D/             # HandTrack3D 3D scene
│   │   ├── VoiceControl/        # voice-harness integration
│   │   └── UI/                  # 2D overlay UI
│   ├── services/
│   │   ├── voiceService.ts      # voice-harness process manager
│   │   ├── mcpServer.ts         # MCP server manager
│   │   └── sensorFusion.ts      # WiFi + camera fusion
│   ├── stores/
│   │   ├── spatialStore.ts      # Main spatial object store
│   │   ├── voiceStore.ts        # Voice status
│   │   └── handStore.ts         # Hand tracking state
│   └── types/
│       └── spatial.types.ts     # Type definitions
├── mcp-server/                  # MCP command server
│   ├── index.ts
│   └── tools/                   # Spatial command tools
├── voice-config/                # voice-harness config
│   ├── mcp.json
│   └── spatial-persona.txt
└── tools/
    └── wifi-companion/          # WiFi positioning server
```

## Development

### Scripts

```bash
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm preview      # Preview production build
pnpm lint         # Lint code
pnpm type-check   # TypeScript type checking
```

### Testing Flow

**Test 1: Voice creates note**
1. Hold spacebar (PTT)
2. Say: "Create a note hello world"
3. Release spacebar
4. ✓ 3D text "hello world" appears

**Test 2: Hand manipulates note**
1. Show hand to webcam
2. Pinch near note
3. Move hand
4. ✓ Note follows hand
5. Open hand
6. ✓ Note drops

**Test 3: Position persistence**
1. Create note with voice
2. Move note with hand
3. Refresh browser
4. ✓ Note appears in same room location

## Roadmap

### Phase 1: MVP (Complete ✓)
- ✓ Voice creates notes, timers, images, widgets
- ✓ Hand gestures manipulate objects (grab, throw)
- ✓ Physics simulation with throw velocity
- ✓ WiFi position persistence with scale calibration
- ✓ Status bar with system indicators

### Phase 2: Rich Content
- Images, videos, web content
- Code snippets with syntax highlighting
- Resizable/rotatable objects

### Phase 3: Multi-Room
- Room detection (WiFi fingerprinting)
- Per-room object filtering
- Spatial triggers

### Phase 4: Collaboration
- Multi-user positioning
- Real-time object sync
- Voice attribution

## Known Limitations (MVP)

- Single room only (no multi-room support)
- Single user (no collaboration)
- Text notes and timers only (no rich content)
- Desktop/laptop only (no mobile)
- Requires WiFi companion app

## Documentation

- [Architecture Design](docs/ARCHITECTURE.md) - System architecture and data flow
- [API Reference](docs/API.md) - Coming soon

## License

MIT

## Acknowledgments

- **voice-harness** - Local voice assistant framework
- **HandTrack3D** - 3D hand tracking SDK
- **MediaPipe** by Google - Hand tracking ML models
- **Three.js** - 3D rendering
- **React Three Fiber** - Declarative Three.js
- **Rapier** - Physics simulation

---

**v0.5.0-alpha** • Phase 1 MVP Complete • Built with ❤️ using React, TypeScript, Three.js, and MediaPipe
