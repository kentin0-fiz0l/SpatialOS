# SpatialOS v0.2 Testing Guide

**New Features: Real MediaPipe Hand Tracking + Grab/Drag Gestures**

---

## What's New in v0.2

✨ **Real hand tracking** - MediaPipe Hands with full 21-point landmarks  
✨ **Pinch gesture detection** - Distance-based pinch recognition  
✨ **Grab/drag physics** - Pinch near objects to grab and move them  
✨ **Enhanced visualization** - Animated grab rings and gesture feedback

---

## Pre-Flight Check

1. **Restart dev server** to load new CDN scripts:
   ```bash
   cd ~/Projects/Active/SpatialOS
   pnpm dev
   ```

2. **Check browser console** (F12) for MediaPipe loading:
   - Should see: `[HandTracking] MediaPipe Hands initialized`
   - Should NOT see: `[HandTracking] mock mode`

---

## v0.2 Test Suite

### Test 1: Real Hand Detection ✨

**Goal:** Verify MediaPipe detects real hands from webcam.

**Steps:**
1. Open http://localhost:5174 (or 5173)
2. Allow webcam access
3. Hold your hand in front of webcam
4. Open browser console (F12)

**Expected Results:**
- ✅ Console shows: `[HandTracking] MediaPipe Hands initialized`
- ✅ Console shows: `[HandTracking] Tracking up to 2 hands with full landmarks`
- ✅ Hand cursor (blue sphere) appears in 3D scene
- ✅ Cursor follows your hand movement in real-time
- ✅ Left hand = green sphere, right hand = blue sphere

**Pass Criteria:** Real-time hand tracking with <100ms latency.

**Troubleshooting:**
- "MediaPipe not loaded" → Hard refresh (Ctrl+Shift+R)
- No hand detected → Ensure good lighting, hand fully visible
- Laggy tracking → Close other tabs, check CPU usage

---

### Test 2: Pinch Gesture Detection ✨

**Goal:** Verify pinch gesture recognition.

**Steps:**
1. With hand visible in webcam
2. Pinch thumb and index finger together
3. Release pinch
4. Watch hand cursor in scene

**Expected Results:**
- ✅ When pinched: Cursor turns red/pink
- ✅ When pinched: Size decreases slightly
- ✅ When pinched: Animated rings appear around cursor
- ✅ When released: Cursor returns to normal (blue/green)
- ✅ Gesture emoji appears above cursor: 🤏

**Pass Criteria:** Pinch detected within 0.05 normalized distance.

---

### Test 3: Grab Object ✨

**Goal:** Test grabbing a spatial object with pinch.

**Steps:**
1. Create a spatial note with voice (or use existing note)
2. Move your hand near the note in 3D space
3. Pinch fingers together
4. Console should show grab message

**Expected Results:**
- ✅ Console logs: `[HandInteraction] Grabbed object <id> with right hand`
- ✅ Object "sticks" to your hand position
- ✅ Hand cursor shows grab rings
- ✅ Object offset preserved (doesn't snap to cursor center)

**Pass Criteria:** Object grabbed when pinched within 0.3m.

**Troubleshooting:**
- Object not grabbed → Get closer (within 30cm in scene space)
- Wrong object grabbed → Multiple objects, nearest one selected
- Can't grab → Check console for errors

---

### Test 4: Drag Object ✨

**Goal:** Verify object follows hand while grabbed.

**Steps:**
1. Grab a note (from Test 3)
2. Keep pinching
3. Move your hand around
4. Watch object in scene

**Expected Results:**
- ✅ Object follows hand position smoothly
- ✅ Object maintains offset from cursor
- ✅ Can move object in all 3 axes (X, Y, Z)
- ✅ Other objects collide with dragged object
- ✅ Cursor shows continuous grab rings

**Pass Criteria:** Smooth object dragging with <16ms frame time.

---

### Test 5: Release Object ✨

**Goal:** Test dropping grabbed object.

**Steps:**
1. While holding an object
2. Open your fingers (release pinch)
3. Watch object behavior

**Expected Results:**
- ✅ Console logs: `[HandInteraction] Released object <id>`
- ✅ Object drops and falls with gravity
- ✅ Hand cursor rings disappear
- ✅ Cursor returns to normal color
- ✅ Object physics enabled (bounces, collides)

**Pass Criteria:** Object released cleanly, physics active.

---

### Test 6: Two-Handed Interaction ✨

**Goal:** Verify both hands work simultaneously.

**Steps:**
1. Show both hands to webcam
2. Pinch with right hand near one object
3. Pinch with left hand near another object
4. Move both hands

**Expected Results:**
- ✅ Both cursors visible (blue + green)
- ✅ Both objects grabbed independently
- ✅ Can drag both objects simultaneously
- ✅ Releasing one hand doesn't affect other
- ✅ Console shows separate grab/release for each hand

**Pass Criteria:** Independent control of two objects.

---

### Test 7: Gesture Performance ✨

**Goal:** Measure hand tracking performance.

**Steps:**
1. Open browser DevTools → Performance tab
2. Start recording
3. Wave hand around for 10 seconds
4. Pinch and grab objects
5. Stop recording
6. Check FPS and frame times

**Expected Results:**
- ✅ 30+ FPS with hand tracking active
- ✅ 60 FPS when hand not visible
- ✅ Frame times <16ms (60fps) or <33ms (30fps)
- ✅ No dropped frames during grab/drag
- ✅ Memory usage <500MB

**Pass Criteria:** Stable 30+ FPS with hands visible.

**Optimization Notes:**
- MediaPipe runs at 30fps (webcam frame rate)
- 3D scene should maintain 60fps
- CPU usage higher than MVP (expected)

---

## Integration Tests

### Full Workflow: Voice + Hands ✨

**Scenario:** Create object with voice, manipulate with hands.

**Steps:**
1. ✅ Say "Create a note hello world" (voice)
2. ✅ Blue note appears in scene
3. ✅ Move hand near note
4. ✅ Pinch to grab
5. ✅ Drag to new position
6. ✅ Release to drop
7. ✅ Note stays in new position
8. ✅ Refresh browser
9. ✅ Note persists with new position
10. ✅ Say "Show me all objects"
11. ✅ Assistant confirms note location

**Pass Criteria:** All 11 steps succeed end-to-end.

---

## Known Limitations (v0.2)

✅ **Working:**
- Real MediaPipe hand tracking (21 landmarks)
- Pinch gesture detection (<0.05 distance)
- Grab/drag interaction (0.3m grab radius)
- Two-handed simultaneous control
- Voice + hand integration

⚠️ **Partial:**
- Throw physics (TODO: velocity impulse)
- Grab indicator on objects (only on cursor)
- Connection line between fingers (landmark data available)

❌ **Not Yet:**
- Other gestures (fist, point, open) - detection ready, actions not
- WiFi + hand sensor fusion
- Multi-user hand tracking sync
- Hand occlusion handling

---

## Performance Benchmarks

### Expected Performance (v0.2):

| Metric | Target | Actual | Notes |
|--------|--------|--------|-------|
| Hand tracking FPS | 30fps | ___ | MediaPipe webcam rate |
| Scene FPS | 60fps | ___ | With hands visible |
| Pinch latency | <100ms | ___ | Gesture → visual |
| Grab latency | <50ms | ___ | Pinch → object attach |
| Memory usage | <600MB | ___ | +100MB vs MVP |

**Measure:**
- FPS: Chrome DevTools → Rendering → Frame Rendering Stats
- Latency: Time from pinch to visual change
- Memory: Chrome DevTools → Memory → Take Heap Snapshot

---

## Comparison: MVP vs v0.2

| Feature | MVP (v0.1) | v0.2 |
|---------|------------|------|
| Hand tracking | Demo cursor (mock) | Real MediaPipe |
| Gestures | None | Pinch detection |
| Interaction | Voice only | Voice + hands |
| Grab/drag | No | Yes (0.3m radius) |
| Performance | 60fps | 30-60fps |
| Bundle size | 3.4MB | ~3.5MB (CDN) |

---

## Debugging Tips

### No Hand Detected
- Check lighting (need bright, even light)
- Ensure full hand visible (all fingers in frame)
- Console should show: `[HandTracking] MediaPipe Hands initialized`
- Try different hand positions/angles

### Pinch Not Detected
- Pinch threshold: 0.05 normalized distance
- Thumb tip must touch index fingertip
- Check console for handedness (left/right)
- Ensure hand confidence >0.5

### Grab Not Working
- Object must be within 0.3m in scene space
- Must be pinching when near object
- Check console: `[HandInteraction] Grabbed object...`
- Only nearest object grabbed

### Performance Issues
- Close other browser tabs
- Reduce webcam resolution (640x480 default)
- Check CPU usage (MediaPipe is CPU-intensive)
- Consider lowering modelComplexity (0 or 1)

---

## Success Criteria ✅

v0.2 is successful if:

- ✅ Real hand tracking works (Test 1)
- ✅ Pinch gestures detected (Test 2)
- ✅ Can grab objects (Test 3)
- ✅ Can drag objects (Test 4)
- ✅ Can release objects (Test 5)
- ✅ 30+ FPS with hands visible (Test 7)
- ✅ Voice + hand integration works (Full Workflow)

**All tests passing = v0.2 COMPLETE! 🎉**

---

## Next Steps (v0.3)

After v0.2 testing:

1. **Sensor Fusion** - Combine WiFi + camera positioning
2. **More Gestures** - Fist (delete), open (select), point (navigate)
3. **Throw Physics** - Apply velocity impulse on release
4. **Code Splitting** - Reduce initial bundle size
5. **Active Timers** - Countdown with spoken alerts

---

## Feedback

Found a bug or have a suggestion?

- Check console (F12) for errors
- Include: Browser, OS, hand tracking model
- Steps to reproduce
- Expected vs actual behavior
- Performance metrics if relevant

🚀 **Enjoy your spatial computing interface with real hand tracking!**
