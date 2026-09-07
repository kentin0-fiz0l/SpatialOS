# AI Avatar Implementation Plan

**Goal**: Create an Ollama-powered AI assistant with 3D presence in the spatial computing environment

**Timeline**: 3-5 days  
**Status**: Phase 1 - Planning

---

## Features

### Phase 1: Basic Avatar (Day 1)
- ✅ Avatar object type in spatial store
- ✅ 3D sphere visualization (pulsing animation)
- ✅ Position in front of user (2m away, 1.5m high)
- ✅ "Hello" button to spawn avatar

### Phase 2: Voice Interaction (Day 2)
- ✅ Voice command: "Ask AI [question]"
- ✅ Send to Ollama
- ✅ Display response as floating text bubble
- ✅ Avatar pulses while "thinking" and "speaking"

### Phase 3: Spatial Awareness (Day 3)
- ✅ Avatar "looks at" nearby objects
- ✅ Can answer questions about spatial context
- ✅ "What objects are nearby?"
- ✅ "Where did I put my notes?"

### Phase 4: Interactive Behaviors (Day 4)
- ✅ Avatar points at objects (raycast line)
- ✅ Avatar moves toward objects being discussed
- ✅ Gaze direction indicator
- ✅ Idle animations (subtle movement)

### Phase 5: Polish (Day 5)
- ✅ Multiple avatar personalities (voice styles)
- ✅ Avatar customization (color, size)
- ✅ Memory integration (remembers conversation)
- ✅ Multi-user: each user sees shared avatar

---

## Technical Design

### Avatar Object Type
```typescript
interface AvatarObject extends SpatialObject {
  type: 'avatar';
  content: {
    name: string;
    personality: 'helpful' | 'casual' | 'professional';
    state: 'idle' | 'thinking' | 'speaking';
    currentResponse?: string;
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
    }>;
    targetObject?: string; // ID of object being looked at
  };
}
```

### Voice Command
```
User: "Ask AI what objects are nearby"
  ↓
Voice service parses: { type: 'ask_ai', question: '...' }
  ↓
Get spatial context (nearby objects)
  ↓
Build prompt with context
  ↓
Send to Ollama
  ↓
Update avatar state: 'thinking' → 'speaking'
  ↓
Display response as text bubble
```

### 3D Visualization
- **Sphere**: Pulsing gradient sphere (purple → blue)
- **Text Bubble**: Floating text above avatar (Billboard component)
- **Gaze Ray**: Line from avatar to target object
- **Idle Animation**: Subtle floating motion (sine wave)

### Ollama Integration
```typescript
// Build context-aware prompt
const nearbyObjects = useSpatialStore.getState()
  .getAllObjects()
  .filter(obj => distance(obj.position, avatar.position) < 3);

const prompt = `
You are a helpful spatial computing assistant. 
You exist as a 3D avatar in the user's space.

Nearby objects:
${nearbyObjects.map(o => `- ${o.type}: "${o.content.text || o.content.label}"`).join('\n')}

User question: "${question}"

Respond naturally and reference specific objects when relevant.
Keep responses under 50 words.
`;
```

---

## Implementation Steps

### Step 1: Avatar Object Type
- [ ] Add `'avatar'` to `SpatialObject['type']` union
- [ ] Create `AvatarContent` interface
- [ ] Add avatar creation helper

### Step 2: 3D Sphere Component
- [ ] Create `Avatar3D.tsx` component
- [ ] Render sphere with gradient material
- [ ] Add pulsing animation (scale 1.0 → 1.1)
- [ ] Position in front of user

### Step 3: Voice Command Handler
- [ ] Add `'ask_ai'` to voice command types
- [ ] Parse "Ask AI [question]" pattern
- [ ] Extract question from voice input

### Step 4: Ollama Query System
- [ ] Build spatial context (nearby objects)
- [ ] Format context-aware prompt
- [ ] Send to Ollama with streaming
- [ ] Update avatar state during query

### Step 5: Response Display
- [ ] Text bubble component (Billboard)
- [ ] Fade in/out animation
- [ ] Word wrap (max width)
- [ ] Auto-hide after 15 seconds

### Step 6: Avatar Animations
- [ ] Idle: subtle float (sine wave on Y)
- [ ] Thinking: fast pulse + particle effect
- [ ] Speaking: slow pulse synced to response length

### Step 7: Spatial Awareness
- [ ] Find nearest object to avatar
- [ ] Update `targetObject` field
- [ ] Render gaze ray (line to object)
- [ ] Include in prompt context

### Step 8: Interactive Behaviors
- [ ] Avatar "points" at mentioned objects
- [ ] Extract object references from Ollama response
- [ ] Move avatar toward discussed object
- [ ] Smooth interpolation (lerp)

---

## UI Changes

### New Button
```tsx
<button onClick={spawnAvatar}>
  🤖 Spawn AI Avatar
</button>
```

### Voice Command Examples
```
"Ask AI what is this" (while looking at object)
"Ask AI where are my notes"
"Ask AI summarize my workspace"
"Ask AI move closer"
"Ask AI goodbye" (despawns avatar)
```

---

## Code Files to Create/Modify

### New Files
- `src/components/Scene3D/Avatar3D.tsx` - Avatar visualization
- `src/components/UI/AvatarTextBubble.tsx` - Response display
- `src/services/avatarService.ts` - Avatar logic and AI integration

### Modified Files
- `src/types/spatial.types.ts` - Add avatar type
- `src/services/voiceService.ts` - Add ask_ai command
- `src/App.tsx` - Handle ask_ai command
- `src/components/Scene3D/Scene3D.tsx` - Render Avatar3D

---

## Example Interaction Flow

```
1. User clicks "🤖 Spawn AI Avatar"
   → Avatar sphere appears 2m in front of user
   → Gentle idle floating animation

2. User: "Ask AI what objects are nearby"
   → Avatar state: 'thinking'
   → Fast pulsing animation
   → Query sent to Ollama with spatial context

3. Ollama responds: "I see 3 sticky notes and 1 timer in front of you"
   → Avatar state: 'speaking'
   → Text bubble fades in above avatar
   → Slow pulsing animation
   → Points at each object mentioned

4. Text bubble auto-hides after 15 seconds
   → Avatar state: 'idle'
   → Returns to gentle floating
```

---

## Stretch Goals (If Time Allows)

- **Multiple Avatars**: Spawn different AI personalities
- **Avatar Memory**: Persistent conversation across sessions
- **Avatar Movement**: Wander around workspace autonomously
- **Avatar Emotions**: Change color based on response tone
- **Avatar Voice**: Text-to-speech for responses
- **Multi-User**: Shared avatar that all users can talk to

---

## Testing Plan

### Manual Tests
1. ✅ Avatar spawns at correct position
2. ✅ Voice command triggers AI query
3. ✅ Response displays correctly
4. ✅ Animations smooth and performant
5. ✅ Spatial context included in prompts
6. ✅ Avatar despawns cleanly

### Edge Cases
- Empty workspace (no nearby objects)
- Ollama unavailable (graceful fallback)
- Very long AI response (truncate or scroll)
- Multiple voice commands quickly (queue)

---

## Success Criteria

✅ Avatar visible and animated in 3D space  
✅ Voice interaction working end-to-end  
✅ Ollama responses displayed as text bubbles  
✅ Spatial awareness (avatar knows nearby objects)  
✅ Smooth, polished animations  
✅ Demo-ready (impressive to show others)  

---

**Let's start with Phase 1: Basic Avatar!** 🚀
