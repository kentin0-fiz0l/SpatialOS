# SpatialOS Testing Guide

Complete end-to-end testing checklist for Phase 1 MVP.

## Pre-Flight Check

Before testing, verify all components are ready:

### 1. Dependencies Installed

```bash
# SpatialOS web app
cd ~/Projects/Active/SpatialOS
pnpm install

# MCP server
cd mcp-server
pnpm install
pnpm build

# WiFi companion (optional)
cd ../tools/wifi-companion
npm install
```

### 2. External Services Running

```bash
# Ollama (required for voice)
ollama serve
ollama pull llama3.1:8b

# voice-harness (check installation)
voice-harness --version
```

### 3. Browsers/Permissions

- Chrome/Edge recommended (best WebGL support)
- Webcam permission will be requested
- Microphone permission (for voice-harness terminal)

---

## Test Suite

### Test 1: 3D Scene Rendering ✓

**Goal:** Verify 3D scene loads and renders correctly.

**Steps:**
1. Start web app: `cd ~/Projects/Active/SpatialOS && pnpm dev`
2. Open http://localhost:5173
3. Wait 2-3 seconds for scene to load

**Expected Results:**
- ✅ Dark gray background with grid
- ✅ Green ambient lighting visible
- ✅ "SpatialOS" title card in top-left
- ✅ Instructions in bottom-left
- ✅ Camera controls work (click + drag to rotate)
- ✅ No console errors (F12 → Console tab)

**Pass Criteria:** Scene renders with grid visible, no errors.

---

### Test 2: Webcam & Hand Tracking ✓

**Goal:** Verify webcam feed and hand tracking initialization.

**Steps:**
1. With web app running, allow webcam when prompted
2. Look for webcam feed in top-right corner

**Expected Results:**
- ✅ Webcam feed appears (mirrored image)
- ✅ Green dot indicator (tracking active)
- ✅ "Tracking Active" label visible
- ✅ Can minimize/maximize feed
- ✅ Demo hand cursor visible (blue sphere moving in scene)

**Pass Criteria:** Webcam shows, demo cursor moves smoothly.

**Troubleshooting:**
- Red indicator → Check browser console for errors
- No video → Click refresh, allow webcam permission
- No cursor → Check console: `[HandTracking] Camera initialized`

---

### Test 3: MCP Server Connection ✓

**Goal:** Verify browser connects to MCP server via WebSocket.

**Steps:**
1. Open browser console (F12 → Console)
2. Look for connection message

**Expected Results:**
- ✅ Console shows: `[MCP Client] Connected to MCP server`
- ✅ WebSocket connection on ws://localhost:8765

**Pass Criteria:** Connection message appears in console.

**Troubleshooting:**
- "Connection failed" → MCP server will be started by voice-harness
- This is normal until voice assistant starts (Test 4)

---

### Test 4: Voice Commands → Object Creation ✓

**Goal:** Verify voice commands create 3D objects.

**Steps:**
1. In separate terminal: `cd ~/Projects/Active/SpatialOS && ./scripts/start-voice.sh`
2. Wait for: "Hold SPACEBAR to talk"
3. Hold SPACEBAR
4. Say clearly: **"Create a note hello world"**
5. Release SPACEBAR
6. Watch browser window

**Expected Results:**
- ✅ Voice-harness shows transcription: "Create a note hello world"
- ✅ LLM responds (2-3 seconds)
- ✅ Blue 3D text panel appears in scene
- ✅ Panel shows "hello world" text
- ✅ Object has physics (can fall if spawned high)
- ✅ Console shows: `[SpatialStore] Added object: note`

**Pass Criteria:** Blue note appears with correct text.

**Troubleshooting:**
- No transcription → Check microphone (voice-harness --list-devices)
- LLM error → Check Ollama is running
- No object → Check browser console, MCP connection
- Wrong text → Speak more slowly, reduce background noise

---

### Test 5: Voice Command - Timer ✓

**Goal:** Verify timer creation works.

**Steps:**
1. Hold SPACEBAR
2. Say: **"Set a timer for 5 minutes"**
3. Release SPACEBAR

**Expected Results:**
- ✅ Green cylindrical timer appears
- ✅ Shows "5:00" text
- ✅ Has physics (collides with ground/objects)
- ✅ Console shows: `[SpatialStore] Added object: timer`

**Pass Criteria:** Green timer with correct duration.

---

### Test 6: Multiple Objects & Physics ✓

**Goal:** Verify multiple objects interact physically.

**Steps:**
1. Create 3 notes with different text:
   - "Create a note one"
   - "Create a note two"  
   - "Create a note three"
2. Rotate camera to see objects
3. Watch objects fall and interact

**Expected Results:**
- ✅ All 3 notes appear
- ✅ Objects have gravity (fall to ground)
- ✅ Objects collide with each other
- ✅ Objects don't overlap/clip
- ✅ Grid plane acts as floor

**Pass Criteria:** 3+ objects with realistic physics.

---

### Test 7: Persistence (localStorage) ✓

**Goal:** Verify objects persist across browser refresh.

**Steps:**
1. Create a note: "Create a note persistence test"
2. Note the object's position in the scene
3. Refresh browser (Ctrl+R or Cmd+R)
4. Wait for scene to reload

**Expected Results:**
- ✅ Scene reloads successfully
- ✅ "persistence test" note reappears
- ✅ Object is in same location
- ✅ All previously created objects return
- ✅ Console shows: `[SpatialStore] Loaded X objects from disk`

**Pass Criteria:** Objects persist and reappear in same locations.

**Clear Test:** Open DevTools → Application → Local Storage → Clear → Refresh. Objects should be gone.

---

### Test 8: List Objects Command ✓

**Goal:** Verify voice can query objects.

**Steps:**
1. Create 2-3 objects (notes/timers)
2. Hold SPACEBAR
3. Say: **"Show me all objects"**
4. Release SPACEBAR

**Expected Results:**
- ✅ Voice assistant lists objects
- ✅ Output shows object types and content
- ✅ Spoken response via TTS

**Pass Criteria:** Correct object list returned.

---

### Test 9: Camera Controls ✓

**Goal:** Verify 3D scene navigation works.

**Steps:**
1. **Rotate:** Left-click + drag
2. **Pan:** Right-click + drag
3. **Zoom:** Scroll wheel

**Expected Results:**
- ✅ Smooth camera rotation around scene
- ✅ Pan moves camera position
- ✅ Zoom in/out works
- ✅ Can't zoom too close (min distance: 2m)
- ✅ Can't zoom too far (max distance: 20m)

**Pass Criteria:** All three controls work smoothly.

---

### Test 10: WiFi Positioning (Optional) ⚠️

**Goal:** Verify room-scale positioning works.

**Prerequisites:**
- WiFi companion installed and running
- 3+ WiFi routers in range
- Router positions calibrated

**Steps:**
1. Start WiFi companion: `cd tools/wifi-companion && npm start`
2. In browser: Settings → Positioning → Enable WiFi mode
3. Calibrate 3 router positions
4. Create a note
5. Walk around room (if using laptop)

**Expected Results:**
- ✅ WiFi companion shows "SpatialOS connected"
- ✅ Console shows: `[WiFi Positioning] Connected`
- ✅ Console shows: `[WiFi Positioning] Position: [x, y, z]`
- ✅ Objects use room coordinates
- ✅ Moving camera doesn't move objects in room space

**Pass Criteria:** Position updates appear in console.

**Note:** This is advanced/optional. Most users will use camera-relative positioning.

---

## Integration Tests

### Full Workflow Test ✓

**Scenario:** Create a spatial note, verify it works end-to-end.

1. ✅ Start all services (web app + voice)
2. ✅ Allow webcam permission
3. ✅ See demo hand cursor moving
4. ✅ Hold SPACEBAR, say "Create a note meeting at 2pm"
5. ✅ Blue note appears with text
6. ✅ Rotate camera to view from different angles
7. ✅ Refresh browser
8. ✅ Note persists and reappears
9. ✅ Hold SPACEBAR, say "Show me all objects"
10. ✅ Assistant lists the note

**Pass:** All 10 steps succeed without errors.

---

## Performance Benchmarks

### Expected Performance:

| Metric | Target | Actual |
|--------|--------|--------|
| Scene FPS | 60fps | ___ |
| Voice latency | <3s | ___ |
| Object creation | <100ms | ___ |
| Webcam FPS | 30fps | ___ |
| Memory usage | <500MB | ___ |

**Measure FPS:**
- Chrome DevTools → Rendering → Frame Rendering Stats
- Should show solid 60fps (or monitor refresh rate)

**Measure latency:**
- Time from "release SPACEBAR" to object appearing
- Should be <3 seconds (STT + LLM + render)

---

## Known Limitations (MVP)

✅ **Working:**
- Voice commands create objects
- 3D rendering with physics
- Object persistence
- Camera controls
- MCP server bridge

⚠️ **Not Yet Implemented:**
- Real hand tracking (using demo cursor)
- Hand gestures to grab/move objects  
- WiFi sensor fusion (WiFi-only mode works)
- Timer countdown (shows static time)
- Object deletion via hand gesture

🔜 **Future (v0.2):**
- Real MediaPipe hand tracking
- Grab/drag with pinch gesture
- Full sensor fusion (WiFi + camera)
- Active timer countdowns
- Multi-user collaboration

---

## Bug Reporting

If you find issues:

1. **Check console** (F12 → Console) for errors
2. **Check terminal** output from voice-harness
3. **Try refresh** (Ctrl+Shift+R for hard refresh)
4. **Check dependencies** (Ollama running, voice-harness installed)

**Report issues:**
- Include: Browser version, OS, console errors
- Steps to reproduce
- Expected vs actual behavior

---

## Success Criteria ✅

MVP is successful if:

- ✅ Voice commands create objects (Test 4 & 5)
- ✅ Objects render in 3D scene (Test 1)
- ✅ Objects persist across refresh (Test 7)
- ✅ Physics works (Test 6)
- ✅ No critical bugs or crashes

**All tests passing = MVP COMPLETE! 🎉**
