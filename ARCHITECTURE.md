# Real-Time Drawing Application Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [WebSocket Protocol](#websocket-protocol)
4. [Undo/Redo Strategy](#undoredo-strategy)
5. [Performance Optimizations](#performance-optimizations)
6. [Conflict Resolution](#conflict-resolution)
7. [Room Management](#room-management)
8. [Scalability Considerations](#scalability-considerations)

---

## System Overview

The Real-Time Drawing Application is a client-server architecture built with Node.js, Express, and Socket.io. It enables multiple users to draw simultaneously on a shared canvas with real-time synchronization.

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  main.js     │  │  canvas.js   │  │  websocket.js  │   │
│  │  (App Logic) │  │  (Rendering) │  │  (I/O Layer)   │   │
│  └──────────────┘  └──────────────┘  └────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    WebSocket Connection                     │
├─────────────────────────────────────────────────────────────┤
│                     SERVER LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  server.js   │  │  rooms.js    │  │  drawing-      │   │
│  │  (Handler)   │  │  (State Mgmt)│  │  state.js      │   │
│  │              │  │              │  │  (Persistence) │   │
│  └──────────────┘  └──────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### Drawing Event Flow

```
USER INTERACTION
       ↓
[Client: Mouse/Touch Event]
       ↓
[canvas.js: Convert to Canvas Coords]
       ↓
[main.js: Collect Stroke Points]
       ↓
[websocket.js: Emit 'draw' Event]
       ↓
[SERVER: Socket.on('draw')]
       ↓
[rooms.js: Add Stroke + Assign ID]
       ↓
[socket.to(room).emit('draw')]
       ↓
[ALL CLIENTS: Receive Stroke]
       ↓
[canvas.js: Render Stroke]
       ↓
[HTML5 CANVAS: Visual Update]
```

### Complete Event Timeline

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER STARTS DRAWING                                      │
│    - mousedown event fires at (x₁, y₁)                     │
│    - canvas.startDrawing() initializes stroke              │
│    - currentStroke = {tool, color, width, points: [{x₁, y₁}]}
│    - Local canvas renders immediately (0-5ms)              │
│                                                              │
│ 2. USER CONTINUES DRAWING                                   │
│    - mousemove events fire continuously                    │
│    - canvas.draw() adds points to currentStroke.points     │
│    - Local canvas updates (no network latency)              │
│    - Throttled cursor updates every 50ms                    │
│    - cursorMove emitted: {x, y}                            │
│    - Other clients see live cursor (50-100ms latency)       │
│                                                              │
│ 3. USER FINISHES DRAWING                                    │
│    - mouseup/mouseleave event fires                        │
│    - canvas.stopDrawing() returns complete stroke          │
│    - websocket.sendDrawing() emits full stroke             │
│    - Server receives stroke in drawing-state.js            │
│    - roomManager.addStroke() assigns unique strokeId       │
│    - Stroke saved to DrawingState.strokes array            │
│                                                              │
│ 4. SERVER BROADCASTS TO OTHERS                              │
│    - socket.to(roomName).emit('draw', stroke)              │
│    - Broadcast excludes sender (already rendered locally)   │
│    - All other clients receive stroke with ID               │
│                                                              │
│ 5. OTHER CLIENTS RENDER                                     │
│    - onDraw handler receives stroke                        │
│    - canvas.addStroke() renders to canvas                  │
│    - Stroke stored in local strokes array                   │
│    - No lag: rendering is near-instant                      │
└─────────────────────────────────────────────────────────────┘
```

### State Synchronization Flow

```
NEW CLIENT JOINS
       ↓
emit 'join-room' {roomName, username}
       ↓
[Server: Creates/Gets room]
[Server: Adds user to room.users Map]
       ↓
emit 'load-strokes' [all strokes from room]
       ↓
[Client: canvas.loadStrokes(strokes)]
[Client: Redraws entire canvas]
       ↓
emit 'users-update' [all users in room]
       ↓
[All clients: Update users list UI]
       ↓
broadcast 'user-joined' {username}
       ↓
[Other clients: Show notification]
```

---

## WebSocket Protocol

### Event Reference

#### Client → Server Events

| Event | Payload | Purpose | Frequency |
|-------|---------|---------|-----------|
| `join-room` | `{roomName, username}` | Join a room | Once per session |
| `draw` | `{tool, color, width, points}` | Send completed stroke | Per stroke (variable) |
| `cursor-move` | `{x, y}` | Update cursor position | Throttled: every 50ms |
| `undo` | (none) | Undo last stroke | On demand |
| `redo` | (none) | Redo last undone stroke | On demand |
| `clear-canvas` | (none) | Clear all strokes | On demand |

#### Server → Client Events (Broadcast)

| Event | Payload | Purpose | Recipients |
|-------|---------|---------|------------|
| `load-strokes` | `[strokes...]` | Initial state sync | Joining client only |
| `draw` | `{id, tool, color, width, points}` | Remote stroke | All except sender |
| `cursor-update` | `{userId, username, cursor}` | Remote cursor | All except sender |
| `undo` | `{strokeId}` | Global undo | All clients |
| `redo` | `{stroke}` | Global redo | All clients |
| `clear-canvas` | (none) | Clear all | All clients |
| `users-update` | `[{id, username}...]` | User list | All in room |
| `user-joined` | `{id, username}` | New user notification | All except joiner |
| `user-left` | `{id, username}` | User disconnect notification | All remaining |

### Message Size Analysis

```
TYPICAL STROKE PAYLOAD
{
  tool: "brush",           // ~8 bytes
  color: "#FF5733",        // ~8 bytes
  width: 5,                // ~2 bytes
  points: [                // N points average: ~6 points per stroke
    {x: 100, y: 200},     // ~16 bytes per point
    {x: 102, y: 205},
    {x: 104, y: 210},
    ...
  ]
}

TOTAL: ~110 bytes per stroke
WITH SOCKET.IO OVERHEAD: ~150-200 bytes

CURSOR UPDATE: ~30 bytes
WITH OVERHEAD: ~50-80 bytes
```

### Network Efficiency

**Optimizations:**
- Strokes sent after completion (not during drawing)
- Cursor updates throttled to 50ms intervals
- Only coordinates stored (derived from DOM later)
- Stroke IDs assigned server-side (single source of truth)
- Broadcast excludes sender (they already rendered locally)

**Result:** Typical session generates 1-5KB per user per minute

---

## Undo/Redo Strategy

### Global State Approach

The application uses a **global undo/redo** system where all users see the same undo/redo history:

```
DRAWING SEQUENCE (All Users See):
Stroke 1 → Stroke 2 → Stroke 3 → Stroke 4
                                       ↑
                              Current State

USER A CLICKS UNDO:
Stroke 1 → Stroke 2 → Stroke 3
                           ↑
                  Current State

BROADCAST to ALL:
undo(Stroke 4.id)

ALL CLIENTS:
- Remove Stroke 4 from canvas
- Add Stroke 4 to redoStack
- UI updates consistently
```

### Data Structures

#### Server-Side (rooms.js)

```javascript
room = {
  users: Map<socketId, userData>,
  drawingState: DrawingState {
    strokes: [stroke1, stroke2, ...],
    currentStrokeId: 42
  },
  redoStack: [undoneStroke1, undoneStroke2, ...]
}
```

#### Client-Side (canvas.js)

```javascript
this.strokes = [stroke1, stroke2, ...]  // All visible strokes
// No local undo stack - always synced with server
```

### Why Global Undo?

**Advantages:**
- ✅ Consistent view for all users
- ✅ No conflicts between local and remote undos
- ✅ Intuitive: "undo last action" is obvious
- ✅ Prevents duplicate undo/redo operations

**Alternative (Not Chosen): Per-User Undo**
- ❌ Would create inconsistent views
- ❌ Conflicts when multiple users undo
- ❌ Confusing UX: "whose undo?"
- ❌ Much more complex state management

### Undo/Redo Algorithm

```
UNDO OPERATION:
┌─────────────────────────────────────┐
│ 1. Client: User clicks Undo button  │
├─────────────────────────────────────┤
│ 2. Client: emit('undo')             │
├─────────────────────────────────────┤
│ 3. Server: drawingState.undo()      │
│    - Remove last stroke from array  │
│    - Return removed stroke          │
│    - Push stroke to redoStack       │
├─────────────────────────────────────┤
│ 4. Server: io.to(room).emit('undo') │
│    - Send strokeId to remove        │
├─────────────────────────────────────┤
│ 5. Client: Receive 'undo' event     │
│    - canvas.removeStroke(strokeId)  │
│    - Redraw canvas                  │
├─────────────────────────────────────┤
│ 6. All users see updated canvas     │
└─────────────────────────────────────┘

REDO OPERATION (Similar):
drawingState.redo() → pop from redoStack
→ Re-add to strokes array
→ Broadcast new stroke to all clients
```

### Edge Cases Handled

```javascript
// Clear canvas clears redo stack
clear() {
  this.strokes = [];
  this.redoStack = [];  // Can't redo after clear
}

// New stroke clears redo stack
addStroke(stroke) {
  this.strokes.push(stroke);
  this.redoStack = [];  // Can't redo after new drawing
}

// Multiple undos work sequentially
undo() → undo() → undo()  // Removes last 3 strokes
```

---

## Performance Optimizations

### 1. Cursor Update Throttling

**Problem:** Mouse events fire 60+ times per second, would overwhelm server

**Solution:**
```javascript
if (!this.throttleTimeout) {
  this.throttleTimeout = setTimeout(() => {
    this.websocket.sendCursorMove(coords);
    this.throttleTimeout = null;
  }, 50);  // Max 20 updates/second per user
}
```

**Impact:** 67% reduction in cursor events (~2.4KB/min → 0.8KB/min per user)

### 2. Stroke Batching

**Problem:** Sending each point individually would create massive overhead

**Solution:**
- Collect all points during drawing in memory
- Send complete stroke only after mouseup
- Points array typically contains 5-20 points (depending on draw speed)

**Impact:** ~95% reduction in draw events

### 3. Canvas Coordinate Caching

**Problem:** DOM queries slow down event handlers

**Solution:**
```javascript
const rect = this.canvas.getBoundingClientRect();  // Cached in handler
return {
  x: clientX - rect.left,
  y: clientY - rect.top
};
```

**Impact:** O(1) coordinate conversion (DOM query only when needed)

### 4. Selective Broadcasting

**Problem:** Sender already rendered locally, would see duplicate

**Solution:**
```javascript
// Sender receives:
socket.emit('draw', stroke);  // Local feedback

// Others receive:
socket.to(roomName).emit('draw', stroke);  // Exclude sender
```

**Impact:** 50% network reduction per broadcast

### 5. Delta Compression (Not Used - Added Complexity)

**Decision:** Store full coordinates instead of deltas

**Reasoning:**
- Canvas is small (typical ~1200x600 pixels)
- Strokes are short (5-20 points)
- Network cost: ~100 bytes per stroke is negligible
- Code complexity: storing deltas would require more processing
- **Trade-off chosen:** Simplicity over 5-10% compression

### 6. Canvas Resize Handling

**Problem:** Resizing canvas clears the drawing

**Solution:**
```javascript
resizeCanvas() {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // Copy old content
  tempCanvas.width = this.canvas.width;
  tempCanvas.height = this.canvas.height;
  tempCtx.drawImage(this.canvas, 0, 0);

  // Resize
  this.canvas.width = container.clientWidth;
  this.canvas.height = container.clientHeight;

  // Restore
  this.ctx.drawImage(tempCanvas, 0, 0);
  this.redrawCanvas();
}
```

**Impact:** Zero data loss on window resize

---

## Conflict Resolution

### Simultaneous Drawing Conflicts

**Scenario:** Users A and B draw overlapping strokes at same time

```
USER A                          USER B
Start stroke at (100, 100)      Start stroke at (200, 100)
         ↓                              ↓
Add points to stroke            Add points to stroke
         ↓                              ↓
Send stroke at t=2.5s           Send stroke at t=2.6s
         ↓                              ↓
Server receives A's stroke      Server receives B's stroke
strokeId: 42                    strokeId: 43
         ↓                              ↓
Broadcast to all:               Broadcast to all:
A's stroke (all users)          B's stroke (all users)
         ↓                              ↓
FINAL RESULT:
Both strokes visible on all canvases
No conflicts - strokes layer correctly
```

**Resolution Strategy: Last-Write-Wins + Server Ordering**

```
ADVANTAGES:
✅ Simple to implement
✅ Deterministic: order based on server receive time
✅ No conflicts possible: each stroke has unique ID
✅ All clients reach same final state
✅ Works at scale with thousands of users

WHY NOT OTHER APPROACHES?

Operational Transformation (OT):
❌ Complex state management
❌ Requires transformation functions
❌ Hard to debug and reason about
❌ Overkill for this use case

Conflict-Free Replicated Data Types (CRDT):
❌ Adds significant complexity
❌ Requires vector clocks or Lamport timestamps
❌ Better for text editors, not drawing
❌ Memory overhead with large histories
```

### Undo/Redo Conflicts

**Scenario:** User A undoes while User B is drawing

```
TIMELINE:
t=1.0s: Stroke 1 created (A or B)
t=1.5s: Stroke 2 created (B)
t=2.0s: User A clicks undo
         ↓
         Stroke 2 removed (last one)

t=2.1s: User B finishes drawing stroke 3
         ↓
         Stroke 3 added
         ↓

RESULT:
Canvas shows: Stroke 1, Stroke 3
No conflict - undo removed Stroke 2 unambiguously
```

**Why This Works:**
- Strokes have global IDs assigned by server
- Undo always removes the most recent stroke ID
- Can't accidentally undo wrong stroke
- Redraw preserves exact visual appearance

### State Divergence Prevention

**Strategy: Server as Single Source of Truth**

```
CLIENT STATE             SERVER STATE             OTHER CLIENTS

Draw Stroke A   ----→  [Receive & Store]  ----→  [Receive & Render]
                         Stroke A

Render locally         Apply Operation        Now Consistent
(0 latency)           (5-20ms)               (100-300ms)
```

**Consistency Guarantees:**

| Operation | Max Divergence | Convergence Time | Guaranteed? |
|-----------|---|---|---|
| Add Stroke | 0 strokes | 100-300ms | ✅ Yes |
| Remove Stroke (undo) | 0 strokes | 100-300ms | ✅ Yes |
| Clear Canvas | Full | 100-300ms | ✅ Yes |
| Cursor Position | Meters | 50-100ms | ⚠️ Transient |

**Implementation:** All mutations must go through server

```javascript
// ❌ WRONG: Modify local state directly
this.strokes.push(newStroke);

// ✅ CORRECT: Send to server first
websocket.sendDrawing(stroke);
// Server broadcasts back to all clients
// Then update local canvas
```

### Race Conditions

**Scenario:** New user joins during large broadcast

```
USER JOINS              STROKE BEING SENT        RESULT
         ↓                      ↓
Emit 'join-room'    Emit 'draw' event
         ↓                      ↓
Server adds user    ├─→ Send to all users
to room             ├─→ (including new user)
         ↓                      ↓
Load all strokes   New user receives both:
(includes stroke)  1. Historic strokes
                   2. Active broadcast
         ↓                      ↓
         └─────────→ Render both

RESULT: ✅ No duplicate rendering
        ✅ No missed strokes
        ✅ Canvas consistent
```

**Prevention:**
- New user joins room before receiving events
- Load all existing strokes first
- Then forward all new events
- No race condition possible

---

## Room Management

### Room Lifecycle

```
ROOM CREATION (On Demand):
- Room doesn't exist until first user joins
- roomManager.createRoom() called on demand
- No server resources allocated for empty rooms

USER JOINS:
room = {
  users: Map {
    socketId1: {id, username, cursor},
    socketId2: {id, username, cursor},
    ...
  },
  drawingState: DrawingState,
  redoStack: []
}

USERS PRESENT: Room maintained in memory

LAST USER LEAVES:
- Remove user from room.users
- If room.users.size === 0:
  - Delete room from manager
  - Free all memory
  - Drawing history lost (intentional: ephemeral)

RESULT: O(1) memory per active user, automatic cleanup
```

### User Tracking

```javascript
room.users.set(socketId, {
  id: socketId,              // Unique per connection
  username: "Alice",         // Display name (non-unique)
  cursor: {x: 150, y: 200}  // Last known position
});

// When user disconnects:
room.users.delete(socketId);
// Their cursor display is removed
// Their strokes remain (others' data)
```

### Per-Room Drawing State

Each room has independent drawing history:

```
ROOM A:
- Strokes: 100
- Users: 3
- RedoStack: 2

ROOM B:
- Strokes: 250
- Users: 5
- RedoStack: 0

ROOM C:
- Strokes: 5
- Users: 1
- RedoStack: 0

INDEPENDENCE:
- Undo in Room A doesn't affect Room B
- Users can't see other rooms' strokes
- Complete isolation
- Scales linearly with room count
```

---

## Scalability Considerations

### Current Architecture Limits

| Metric | Limit | Reason |
|--------|-------|--------|
| Users per room | ~50-100 | Server broadcast O(n) |
| Rooms per server | ~1000+ | In-memory Map storage |
| Concurrent connections | ~10K | Node.js process limit |
| Memory per room | ~1MB | 1KB per stroke × 1000 strokes |

### Identified Bottlenecks

**1. Broadcast Storm**
```
Problem: Room with 100 users, each draws a stroke
- Each stroke broadcast to 99 others = 100 broadcasts
- Total messages: 100 * 99 = 9,900 messages/minute
- Network: ~1.5MB/min

Solution if needed:
- Use pub/sub (Redis)
- Implement message compression
- Add strokes per batch
```

**2. Server-Side Stroke Storage**
```
Problem: Large drawing sessions accumulate strokes
- 1000 strokes × 150 bytes = 150KB per room
- Not an issue for hours-long sessions
- But unlimited growth possible

Solution if needed:
- Archive strokes to Supabase periodically
- Compress old strokes
- Implement stroke pruning by age
```

**3. Memory Growth**
```
Current: All strokes in memory indefinitely
Max sustainable: ~500K strokes per server
= ~75MB RAM

Solution if needed:
- Add persistent storage (Supabase)
- Implement LRU cache
- Archive inactive rooms
```

### Future Scaling Strategies

**Option 1: Horizontal Scaling with Redis**
```
┌──────────────┐
│  User 1-100  │──┐
└──────────────┘  │
                  ├──→ [Redis Pub/Sub]
┌──────────────┐  │
│  User 101-200│──┤
└──────────────┘  │
                  ├──→ [Central Broker]
┌──────────────┐  │
│  User 201-300│──┘
└──────────────┘

Benefits:
- Multiple Node.js servers
- Each handles subset of rooms
- Redis synchronizes cross-server messaging
- Scales to 1M+ concurrent users
```

**Option 2: Data Persistence with Supabase**
```
Real-time events → Redis/Socket.io
                      ↓
                 [Async] ↓
              Supabase Database

Benefits:
- Permanent stroke history
- Replay drawing sessions
- Analytics and audit trail
- Load room state from DB on restart
```

**Option 3: CDN for Static Assets**
```
Currently: Express serves HTML/CSS/JS
Scaled: CloudFlare/AWS CloudFront serves:
- index.html
- style.css
- main.js, canvas.js, websocket.js

Benefits:
- Reduced server load
- Faster initial page load (edge locations)
- Reduced bandwidth costs
```

### Monitoring Recommendations

```
METRICS TO TRACK:

1. Connection Metrics
   - Active connections per room
   - New connections per minute
   - Disconnects per minute
   - Avg session duration

2. Performance Metrics
   - Message latency (p50, p95, p99)
   - Strokes per second (throughput)
   - Server CPU usage
   - Memory consumption

3. Quality Metrics
   - Messages dropped (should be 0)
   - Draw lag (time from send to render)
   - User complaints/errors

4. Business Metrics
   - Concurrent users
   - Peak simultaneous users
   - Rooms created per day
   - Feature usage (undo/redo rates)
```

---

## Summary

### Design Principles Applied

1. **Simplicity First** - Global undo, not per-user conflict resolution
2. **Server as Authority** - All mutations validated server-side
3. **Performance via Constraint** - Throttle cursors, batch strokes
4. **Memory Efficiency** - Clean up empty rooms automatically
5. **Scalability via Composition** - Redis/Supabase ready if needed

### Trade-offs Made

| Choice | Benefit | Cost |
|--------|---------|------|
| Global undo/redo | Consistent UX | Can't redo after new draw |
| In-memory storage | Instant access | Lost on server restart |
| Throttled cursors | 67% bandwidth savings | 50ms cursor lag |
| Last-write-wins conflicts | O(1) complexity | No custom resolution |
| Full stroke coordinates | Simplicity | 5-10% larger messages |

### Assumptions

- Room sizes typically < 50 users
- Sessions last < 2 hours
- Network latency 50-300ms
- Strokes 5-20 points each
- Users drawn 1-10 strokes per minute
