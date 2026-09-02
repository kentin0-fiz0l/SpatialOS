# SpatialOS Quick Start Guide

Get SpatialOS running in 5 minutes.

## Prerequisites

1. **Node.js 18+** and **pnpm**
2. **Ollama** running locally
3. **voice-harness** installed
4. **Webcam** (for hand tracking - optional for MVP)

## Setup (First Time)

### 1. Install Dependencies

```bash
cd ~/Projects/Active/SpatialOS
pnpm install

cd mcp-server
pnpm install
pnpm build
```

### 2. Start Ollama

```bash
# In a separate terminal
ollama serve

# Pull the model (if not already)
ollama pull llama3.1:8b
```

### 3. Install voice-harness

```bash
cd ~/Projects/Active/voice-harness
pip install -e .
```

## Running SpatialOS

You need **TWO terminals**:

### Terminal 1: Web App + 3D Scene

```bash
cd ~/Projects/Active/SpatialOS
pnpm dev
```

Open **http://localhost:5173** in your browser.

You should see:
- 3D scene with grid
- Dark background
- Orbit controls (click and drag to rotate camera)

### Terminal 2: Voice Assistant

```bash
cd ~/Projects/Active/SpatialOS
./scripts/start-voice.sh
```

You should see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Hold SPACEBAR to talk
  ESC to quit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Testing Voice Commands

### Create a Note

1. **Hold SPACEBAR** in the voice terminal
2. Say: **"Create a note hello world"**
3. **Release SPACEBAR**
4. Look at the browser → A blue 3D text panel appears!

### Create a Timer

1. **Hold SPACEBAR**
2. Say: **"Set a timer for 5 minutes"**
3. **Release SPACEBAR**
4. Look at the browser → A green countdown timer appears!

### List Objects

1. **Hold SPACEBAR**
2. Say: **"Show me all objects"**
3. **Release SPACEBAR**
4. Voice assistant lists all spatial objects

## 3D Scene Controls

| Action | Control |
|--------|---------|
| Rotate camera | Left click + drag |
| Pan camera | Right click + drag |
| Zoom | Scroll wheel |
| Reset view | Refresh browser |

## Troubleshooting

### Voice not working

**Check MCP server is connected:**
- Open browser console (F12)
- Look for: `[MCP Client] Connected to MCP server`
- If not connected, check Terminal 2 for errors

**Check Ollama:**
```bash
curl http://localhost:11434/api/tags
```
Should return list of models.

**Check voice-harness:**
```bash
voice-harness --list-devices
```
Should show your microphone.

### Objects not appearing

**Check browser console:**
- F12 → Console tab
- Look for `[SpatialStore] Added object: note`

**Check MCP server logs:**
- Terminal 2 should show:
  ```
  [MCP] Received command: createObject
  ```

**Force refresh:**
- Browser: Ctrl+Shift+R (hard refresh)

### MCP server won't start

**Rebuild it:**
```bash
cd ~/Projects/Active/SpatialOS/mcp-server
pnpm build
```

**Check Node version:**
```bash
node --version  # Should be 18+
```

## What's Working (MVP Phase 1)

- ✅ Voice commands create 3D objects
- ✅ Objects appear in 3D scene
- ✅ Objects have physics (gravity, collisions)
- ✅ Objects persist to localStorage
- ✅ Camera controls

## What's NOT Working Yet

- ⏹ Hand tracking (need to integrate HandTrack3D)
- ⏹ Hand gestures to grab/move objects
- ⏹ WiFi room positioning
- ⏹ Timer countdown (displays static time)

## Next Steps

1. **Test voice commands** (this guide)
2. **Integrate hand tracking** (Task #9)
3. **Add WiFi positioning** (Task #10)
4. **Record demo video** (Task #11)

## File Structure

```
SpatialOS/
├── scripts/
│   ├── start-voice.sh      ← Start voice assistant
│   └── start-all.sh         ← All-in-one launcher
├── mcp-server/              ← Voice command bridge
│   └── index.js
├── voice-config/
│   ├── mcp.json             ← MCP server config
│   └── spatial-persona.txt  ← AI assistant persona
├── src/
│   ├── components/Scene3D/  ← 3D rendering
│   ├── stores/              ← State management
│   └── services/            ← MCP client
└── package.json
```

## Support

- **Architecture**: `docs/ARCHITECTURE.md`
- **MCP Server**: `mcp-server/README.md`
- **Main README**: `README.md`

---

**Ready to create spatial objects with your voice?** 🎤✨

Run both terminals and start talking!
