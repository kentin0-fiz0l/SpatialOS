# AI Avatar Testing Guide 🤖

**Status**: ✅ All 3 Phases Complete  
**Ready to test**: YES!

---

## Quick Start (60 seconds)

### 1. Open the App
```bash
cd ~/Projects/Active/SpatialOS
pnpm dev
# Open http://localhost:5176
```

### 2. Wait for Scene to Load
- You'll see "Loading 3D environment..."
- Wait ~5-10 seconds for:
  - Physics engine (Rapier)
  - Hand tracking (MediaPipe)
  - 3D scene render
- When ready: Dark 3D space with grid floor

### 3. Spawn the Avatar
- Click **"🤖 Spawn AI Avatar"** button (purple, bottom-left)
- Avatar appears as **purple pulsing sphere** ~2m in front of you
- Label "AI Assistant" above it

### 4. Test Voice Interaction
```
1. Hold SPACEBAR (PTT mode)
2. Say: "Ask AI what objects are nearby"
3. Release SPACEBAR
4. Watch avatar:
   → Turns PINK (thinking)
   → Queries Ollama
   → Turns CYAN (speaking)
   → Text bubble appears with response
   → Auto-hides after 15 seconds
```

---

## Detailed Testing Steps

### Test 1: Basic Avatar Spawn ✅

**Steps**:
1. Open http://localhost:5176
2. Wait for 3D scene to load
3. Click "🤖 Spawn AI Avatar"

**Expected**:
- Purple sphere appears at position [0, 1.5, -2]
- Gentle floating animation (idle state)
- "AI Assistant" label above sphere
- Console: `[App] 🤖 AI Avatar spawned`

**Verify**:
- [ ] Avatar visible in 3D scene
- [ ] Purple color (idle)
- [ ] Smooth floating animation
- [ ] Label rendering correctly

---

### Test 2: Voice Command Recognition ✅

**Steps**:
1. Hold SPACEBAR
2. Say: "Ask AI hello"
3. Release SPACEBAR
4. Check console logs

**Expected Console**:
```
[Voice] Final: "ask AI hello"
[App] Voice command received: {type: 'ask_ai', question: 'hello'}
[App] Ask AI: hello
```

**Verify**:
- [ ] Voice recognition working
- [ ] Command parsed correctly
- [ ] Question extracted: "hello"

---

### Test 3: Avatar State Transitions ✅

**Steps**:
1. Voice command: "Ask AI test"
2. Watch avatar carefully

**Expected Sequence**:
```
1. idle (purple, gentle float, 1.0x speed)
   ↓
2. thinking (PINK, fast pulse, 4.0x speed, "🤔 Thinking..." bubble)
   ↓ (1-3 seconds while Ollama responds)
3. speaking (CYAN, slow pulse, 2.0x speed, text bubble with response)
   ↓ (15 seconds display)
4. idle (purple, gentle float)
```

**Verify**:
- [ ] Purple → Pink transition smooth
- [ ] "Thinking..." indicator appears
- [ ] Pink → Cyan when response ready
- [ ] Text bubble fades in
- [ ] Returns to idle after 15s

---

### Test 4: Spatial Awareness ✅

**Setup - Create test objects**:
```
1. Hold SPACEBAR
2. Say: "Create a note hello world"
3. Release SPACEBAR
4. Repeat for more objects:
   - "Set a timer for 30 seconds"
   - "Create a note testing spatial awareness"
```

**Test Query**:
```
Hold SPACEBAR + "Ask AI what objects are nearby"
```

**Expected Response** (similar to):
```
"I see 2 notes and 1 timer around you. The notes say 
'hello world' and 'testing spatial awareness', and there's 
a 30-second timer running."
```

**Verify**:
- [ ] Avatar mentions correct number of objects
- [ ] References specific object types
- [ ] Includes object content (note text, timer duration)
- [ ] Natural language response

**Console Verification**:
```javascript
[App] Querying Ollama with context...
// Should show prompt with:
// "Nearby objects:
//  - note: 'hello world'
//  - timer: '30 seconds'
//  - note: 'testing spatial awareness'"
```

---

### Test 5: Response Display ✅

**Steps**:
1. Ask AI any question
2. Wait for response
3. Observe text bubble

**Expected**:
- Text bubble appears ABOVE avatar
- Cyan background (rgba(78, 205, 196, 0.95))
- White text, readable font (14px)
- Max width: 300px
- Fade-in animation (0.3s)
- Auto-hides after 15 seconds
- Manual dismiss: Avatar returns to idle

**Verify**:
- [ ] Bubble positioned correctly
- [ ] Text readable and wrapping
- [ ] Fade-in smooth
- [ ] Auto-hide timer working
- [ ] No overflow issues

---

### Test 6: Error Handling ✅

**Test A: No Avatar**
```
1. Don't spawn avatar
2. Voice: "Ask AI hello"
```
**Expected**: Error message "No AI avatar found. Click 'Spawn AI Avatar' first."

**Test B: Ollama Unavailable**
```
1. Stop Ollama: pkill ollama
2. Spawn avatar
3. Voice: "Ask AI test"
```
**Expected**: 
- Avatar → pink (thinking)
- Error response: "Sorry, I encountered an error. Is Ollama running?"
- Returns to idle after 5s

**Test C: Duplicate Avatar**
```
1. Spawn avatar
2. Click spawn button again
```
**Expected**: Console log "Avatar already exists", no second spawn

**Verify**:
- [ ] Graceful error messages
- [ ] No crashes
- [ ] Auto-recovery to idle

---

### Test 7: Conversation History ✅

**Steps**:
1. Ask multiple questions:
   - "Ask AI what's your name"
   - "Ask AI what objects do you see"
   - "Ask AI summarize our conversation"

2. Open browser DevTools
3. Find avatar object in localStorage
4. Check `conversationHistory` array

**Expected Structure**:
```javascript
conversationHistory: [
  {
    role: "user",
    content: "what's your name",
    timestamp: 1788793000000
  },
  {
    role: "assistant", 
    content: "I'm AI Assistant, a spatial computing helper.",
    timestamp: 1788793002000
  },
  // ... more entries
]
```

**Verify**:
- [ ] History stored correctly
- [ ] User/assistant roles correct
- [ ] Timestamps present
- [ ] Persists in localStorage

---

### Test 8: Multiple Objects Nearby ✅

**Setup - Create many objects**:
```
Create 10+ objects in different positions:
- Notes at various locations
- Timers with different durations
- Widgets (clock, calendar)
```

**Test Queries**:
```
1. "Ask AI how many objects are nearby"
2. "Ask AI what types of objects do you see"
3. "Ask AI find my notes"
4. "Ask AI are there any timers"
```

**Expected**:
- Avatar scans 5m radius
- Lists all visible objects
- Filters by type when asked
- Natural language summary

**Verify**:
- [ ] Counts accurate
- [ ] Type filtering working
- [ ] Distance calculation correct (5m radius)
- [ ] Performance good (<100ms scan)

---

## Voice Command Variations

The parser accepts multiple patterns:

**Working Patterns**:
```
✅ "Ask AI [question]"
✅ "Hey AI [question]"
✅ "Talk to AI [question]"
✅ "Ask the AI [question]"
✅ "Hey the assistant [question]"
```

**Examples**:
```
"Ask AI what time is it"
"Hey AI where are my notes"
"Talk to AI summarize my workspace"
"Ask the AI what objects are visible"
```

---

## Performance Benchmarks

### Expected Latency

| Operation | Time |
|-----------|------|
| Voice recognition | 0.5-1s |
| Command parsing | <10ms |
| Spatial scan (5m) | <1ms |
| Ollama query | 1-3s |
| State transition | <50ms |
| Text render | <100ms |
| **Total UX latency** | **~2-4s** |

### Memory Usage

| Component | Size |
|-----------|------|
| Avatar object | ~2KB |
| Conversation history (10 turns) | ~5KB |
| Scene rendering | ~50MB (Three.js) |

---

## Troubleshooting

### Issue: Avatar Not Visible

**Symptoms**: Clicked spawn, no purple sphere

**Fixes**:
1. Check console for errors
2. Wait for "3D Scene Active" indicator
3. Try orbit controls (drag to rotate view)
4. Check Objects count increased (13 → 14)
5. Verify avatar in localStorage

**Debug**:
```javascript
// In browser console:
const objects = JSON.parse(localStorage.getItem('spatial-objects'));
const avatar = objects.find(o => o.type === 'avatar');
console.log('Avatar:', avatar);
```

### Issue: Voice Not Working

**Symptoms**: Spacebar does nothing

**Fixes**:
1. Check browser supports Web Speech API (Chrome/Edge)
2. Verify microphone permissions granted
3. Check console for voice errors
4. Try "Test AI" button to verify Ollama first

**Debug**:
```javascript
// Check voice service:
[Voice] Started listening  ← Should see this
[Voice] Final: "..."      ← Should see transcript
```

### Issue: No Response from AI

**Symptoms**: Avatar stuck on pink (thinking)

**Fixes**:
1. Verify Ollama running: `curl http://localhost:11434/api/tags`
2. Check model loaded: `llama3.1:8b`
3. Test Ollama directly: `ollama run llama3.1:8b "hello"`
4. Check network tab for failed requests

**Debug**:
```bash
# Terminal:
ollama ps  # Should show running model
ollama list  # Should show llama3.1:8b
```

### Issue: Avatar Stuck in State

**Symptoms**: Won't return to idle

**Fixes**:
1. Check console for errors
2. Refresh page (avatar reloads from localStorage)
3. Delete avatar and respawn:
   ```javascript
   // Browser console:
   const store = window.__SPATIAL_STORE__.getState();
   const avatar = store.getAllObjects().find(o => o.type === 'avatar');
   store.deleteObject(avatar.id);
   ```

---

## Advanced Testing

### Test Concurrent Users (Multi-User)

**Setup**:
1. Normal browser: User A
2. Incognito window: User B

**Test**:
1. Both spawn avatars
2. User A: "Ask AI what do you see"
3. User B: "Ask AI what objects are here"
4. Verify: Both get same spatial context

**Expected**: Each user's avatar responds independently with same object list

---

### Test Avatar Persistence

**Steps**:
1. Spawn avatar
2. Ask a question (creates conversation history)
3. Refresh page
4. Check avatar still exists
5. Conversation history preserved

**Verify**:
- [ ] Avatar reappears after refresh
- [ ] Position maintained
- [ ] Conversation history intact
- [ ] Returns to idle state

---

### Test Performance Under Load

**Steps**:
1. Create 50+ objects in scene
2. Spawn avatar
3. Ask: "Ask AI list all objects"
4. Measure response time

**Expected**:
- Spatial scan: <5ms (even with 50 objects)
- Ollama query: 2-4s (depending on response length)
- No lag or stutter

---

## Success Criteria

### Phase 1: Visual ✅
- [x] Avatar renders as pulsing sphere
- [x] State-based colors (purple/pink/cyan)
- [x] Smooth animations (60fps)
- [x] Labels display correctly

### Phase 2: Voice ✅
- [x] Voice command parsing works
- [x] Ollama integration functional
- [x] Response display working
- [x] Error handling graceful

### Phase 3: Spatial ✅
- [x] Nearby object detection (5m)
- [x] Context-aware prompts
- [x] Natural language responses
- [x] Conversation tracking

---

## Demo Script

**For showing to others**:

```
1. "First, I'll spawn an AI assistant in my spatial workspace"
   → Click spawn button
   → Purple sphere appears

2. "Let me create some objects for context"
   → Voice: "Create a note meeting at 3pm"
   → Voice: "Set a timer for 5 minutes"

3. "Now I'll ask the AI what it sees"
   → Voice: "Ask AI what objects are nearby"
   → Avatar turns pink (thinking)
   → Avatar turns cyan with response
   → Shows: "I see a note about a meeting at 3pm and a 5-minute timer"

4. "The AI understands the spatial context!"
   → Natural language
   → References specific objects
   → Spatial awareness working
```

**Wow factor**: Avatar changes color, text bubble appears, knows about objects!

---

## Next Steps

Once basic testing complete:

**Optional Enhancements**:
- [ ] Avatar points at objects (raycast)
- [ ] Avatar moves toward discussed objects
- [ ] Multiple personalities
- [ ] Gesture responses
- [ ] Voice output (TTS)

**Production Ready**:
- [ ] Error telemetry
- [ ] Performance monitoring  
- [ ] User analytics
- [ ] Multi-user stress test

---

**Happy Testing! 🤖✨**

The AI Avatar is ready to interact with your spatial workspace!
