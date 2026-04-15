# PixDash Frontend Architecture Review

**Reviewer**: Frontend/UX Architect  
**Date**: 2026-04-15  
**Branch**: `dev`  
**Scope**: `packages/frontend/src/` + backend dependency surface

---

## 1. Architecture Assessment

### Component Structure: B+

The component hierarchy is reasonable for a medium-complexity app:

```
App → AppLayout → [OfficeCanvas | StaffView]
                  → AgentPanel (sidebar)
                  → CustomizerModal
```

**What's good**: Clear separation between canvas rendering (`components/canvas/`), UI panels (`components/ui/`), staff org chart (`components/staff/`), and layout (`components/layout/`). The `NavigationSwitch` is a clean, reusable view-mode toggle.

**What's problematic**:

1. **`AppLayout.tsx` is a 200-line god component**. It handles view mode state, agent selection, customizer open/save, timezone, settings, sidebar content (agent roster, controls, error display), and panel orchestration. This should be decomposed. The sidebar alone (lines ~130-210) should be its own `<Sidebar>` component with sub-components for roster, settings, and error display.

2. **`useAgents.ts` is 300+ lines and does too much**. It handles: initial fetch, WebSocket event processing (8 event types), movement buffering, smooth position management, reconnect sync, fallback healing, debug logging, and panel orchestration. This is the worst offender for single-responsibility violation. The WebSocket event switch statement alone (lines ~120-280) should be extracted into an `AgentEventHandler` module.

3. **`AgentRenderer.ts` is a class-based render utility mixing concerns**. It handles: sprite loading/caching, glow effect generation, label drawing, z-sorting, debug logging, hit-testing, and seated-offset calculation. The glow cache (`getGlowCanvases`) generates new canvases per sprite by doing pixel-level edge detection — this is expensive and belongs in a preprocessing step, not in the render loop.

### State Management: C

Four Zustand stores (`agentsStore`, `movementStore`, `uiStore`, `settingsStore`) plus module-level mutable singletons.

**Critical problem: dual state channels for position data**

The codebase maintains **two parallel position systems** that create synchronization complexity:

1. **Zustand `agentsStore`** — throttled at ~8Hz via `agentMovementBuffer` (`useAgents.ts` lines ~35-45)
2. **Module-level `smoothPositionTargets` Map** — written by every WebSocket movement event, read by the canvas render loop at 60fps (`useAgents.ts` line 13)

This dual-channel approach exists because the developers correctly identified that Zustand updates are too slow for smooth 60fps movement. But instead of building a proper interpolation system, they created an ad-hoc side-channel that bypasses Zustand entirely.

**Consequence**: The `AgentPanel` status tab shows stale `position.x/y` from the throttled Zustand store, while the canvas shows smooth positions from the Map. Users see different coordinates in the panel vs. what's on screen. The panel shows tile coordinates (`position.x/y`) which are raw backend tile positions, not the pixel positions the canvas renders.

**`movementStore` is mostly dead code**. After the "server-authoritative migration," three of its core methods (`placeAgentsOnLoad`, `handleStatusChange`, `handleConference`) are no-ops that just `console.warn` and do nothing. Its `tick()` method syncs `interpolatedX/Y` from movement state into Zustand — but this is redundant since the canvas reads from `smoothPositionTargets` directly. The entire store could be deleted.

**`uiStore` has redundant state**: `panelOpen` and `customizerOpen` are duplicated as `isCustomizerOpen` and `isSidebarCollapsed`. The store exports both as separate fields plus a plain object wrapper (`uiStore`) that re-exposes getters — this is unnecessary indirection.

### Data Flow: WebSocket → Store → Render

```
GatewayClient (backend)
  → WebSocket broadcast
    → useWebSocket.ts (event queue + version counter)
      → useAgents.ts (drainEvents → switch on event type)
        → agentsStore.updateAgent() (throttled for movement)
        → smoothPositionTargets Map (immediate for movement)
          → OfficeCanvas draw loop reads both
```

**The event queue pattern is solid** — `useWebSocket` accumulates events into a ref and increments a version counter, which triggers `useAgents` to drain and process them. This avoids React re-renders per message. Good.

**Problem**: The `drainEvents` call happens inside a `useEffect` keyed on `eventsVersion`. This means events are only processed after React commits. During high-frequency movement broadcasts (backend sends at ~20Hz via 50ms tick interval), events accumulate and are processed in batches. The buffering logic (`bufferMovementUpdate`) adds another 125ms throttle on top of this, creating a 2-stage delay. The `smoothPositionTargets` write happens immediately, which is correct, but the Zustand state trails by 125-250ms.

### Separation of Concerns: C+

The frontend contains significant backend logic that shouldn't be there:

- **`waypoints.ts`** — 500+ lines defining every waypoint coordinate, no-go tiles for restrooms and desks, waypoint claiming, distance calculation, and nearest-available-waypoint selection. This is a **full duplicate** of the backend's waypoint data. Any change to office layout requires updating both codebases.

- **`collisionMap.ts`** — loads `blocked.png` and builds a collision grid client-side. The backend already has `CollisionGridLoader` and `PathfindingService`. The frontend loads the collision map but never uses it for pathfinding — it only uses `pickDeskPositions` (fallback placement) and `isWalkableTile` (unused by any component). **Dead weight: the entire collision map loader is unnecessary** since movement is server-authoritative.

- **`pathfinding.ts`** — A* implementation. Also unused since movement is server-authoritative. The only caller is `findNearestWalkableTile` in `movement.ts`, which is also dead code.

- **`sprite-generator.ts`** — 300+ lines of procedural pixel sprite generation (body, outfit, hair, accessories). This generates `ImageData` objects that are never used anywhere in the codebase. The actual rendering uses pre-baked sprite sheets loaded by `spriteSheets.ts`. **This entire file is dead code.**

---

## 2. UX Analysis

### Navigation and Layout: B

The two-view layout (Office / Staff) via `NavigationSwitch` is clean. The header shows connection state and agent count — useful at a glance.

**Problems**:

1. **No URL-based routing**. View mode is stored in `localStorage` (`pixdash-view`) but not in the URL. Users can't bookmark or share a specific view. This is a missed opportunity for a dashboard that people might want to pin in a tab.

2. **The sidebar has no scroll affordance**. The `AgentPanel` has `overflow-y-auto` but the default sidebar (when no agent is selected) doesn't. If the agent roster grows beyond the viewport height, content clips silently.

3. **Panel state is confusing**. When you click an agent, the sidebar transforms from "roster + controls + settings" into "agent detail panel." There's no way to get back to the roster without deselecting the agent. This is a one-way navigation with no "back" affordance.

4. **Debug overlays are always visible**. The "Click" coordinate panel and "Camera" info panel at the bottom-left of the canvas are visible to all users. These are developer tools that should be behind a debug flag or togglable.

### Interaction Patterns: What Can Users Actually DO?

| Action | Supported? | Notes |
|--------|-----------|-------|
| View agents walking in office | ✅ | Core feature, works well |
| Click agent to see details | ✅ | Opens panel |
| Pan/zoom the office canvas | ✅ | Touch + mouse |
| View agent status/config/logs/tasks | ✅ | Tabbed panel |
| Customize agent appearance | ✅ | Preset selection only |
| Rename agent (display name) | ✅ | Inline edit, auto-saves on blur |
| Switch to org chart view | ✅ | Staff hierarchy |
| Follow a specific agent | ❌ | Camera doesn't track |
| Search for an agent | ❌ | Roster is flat list |
| Filter agents by status | ❌ | No online/offline filter |
| Zoom to fit all agents | ✅ | "Fit" button exists |
| Drag agents to new positions | ❌ | Reasonable for future |
| Keyboard navigation | ❌ | No keyboard shortcuts at all |

**The app is observation-only with minimal interaction.** Users can watch agents move, click to inspect, and customize sprites. There's no ability to interact with agents, send them commands, or influence the simulation. This might be intentional for v1, but the UI doesn't communicate this limitation.

### Responsiveness: D

The layout uses `xl:grid-cols-[1fr_320px]` for the office view, which means:

- **Desktop (≥1280px)**: Two-column layout. ✅ Works.
- **Tablet (768-1279px)**: Single column, panel stacks below canvas. The canvas takes full width but the header has `flex` items that may wrap awkwardly.
- **Mobile (<768px)**: Same as tablet but tighter. The `px-6 md:px-10` padding is aggressive on small screens. The header has two status cards side-by-side that will overflow.

**The canvas has no mobile touch handling for pinch-to-zoom.** It handles `pointerdown/pointermove/pointerup` for drag, but scroll zoom only works with `WheelEvent`. On mobile, there's no way to zoom.

**Staff view has `min-h-[70vh]`** which is fine on desktop but may cause issues on mobile browsers where viewport height is unreliable.

### Accessibility: F

- **No ARIA landmarks**. The `<main>` element has no `role` or `aria-label`. The sidebar, canvas, and header are all un-semantic `<div>` and `<section>` elements.
- **No keyboard navigation for agent roster**. The roster buttons have `type="button"` which is good, but there's no `tabIndex` management, no arrow-key navigation, and no focus ring styles.
- **Canvas is entirely inaccessible**. No ARIA description, no text fallback for agent positions. Screen reader users get nothing from the main content area.
- **The `AgentStatus` component injects a `<style>` tag on every render** (keyframe animation definition). This is not an accessibility issue per se, but it's technically wrong — the same CSS rule is duplicated N times in the DOM where N is the number of agents rendered.
- **Color-only status indication**. Status uses colored dots + colored text. No icon or pattern differentiation for color-blind users.
- **No skip-to-content link**.
- **No focus management** when opening/closing the agent panel or customizer modal.

### User Onboarding: F

There is none. A new user sees:

1. A pixel art office with characters walking around
2. A header with "SNES agent theatre" and "PixDash"
3. Two status cards ("Agents: N" and "Realtime: Live")
4. A sidebar with "Controls: Drag to pan · Scroll to zoom · Click agents"

The "Controls" hint is the only onboarding. There's no explanation of:
- What agents represent
- What "working" vs "idle" vs "busy" means in context
- What the Staff view shows
- That the agent movement is autonomous
- That agents correspond to real AI agents on the OpenClaw Gateway

---

## 3. Code Quality

### Dead Code

| File | What's Dead | Lines |
|------|-----------|-------|
| `lib/sprite-generator.ts` | Entire file. `generateSprite()` / `generateSpriteSheet()` / `hashAppearance()` are never called by any component or hook. | ~300 |
| `lib/pathfinding.ts` | `findPath()` and `isWalkableTile()` are never called. Only imported by dead `movement.ts` functions. | ~80 |
| `lib/collisionMap.ts` | `loadCollisionMap()` result is used only by dead functions. `pickDeskPositions()` is never called by any component. | ~120 |
| `lib/movement.ts` | `advanceAgentAlongPath()`, `findNearestWalkableTile()`, `getDirectionFromDelta()` — all dead after server-authoritative migration. `getArrivalStateForMovementType()` is still used. | ~60 |
| `lib/tilemap-loader.ts` | `loadDefaultTilemap()` is never called. The canvas uses a pre-rendered background image, not a tilemap renderer. | ~40 |
| `components/canvas/TilemapRenderer.ts` | Entire file and its `.tsx` variant. Never instantiated. The canvas renders a pre-baked office.png background. | ~150 |
| `store/movementStore.ts` | `placeAgentsOnLoad`, `handleStatusChange`, `handleConference` are no-ops. `tick()` is redundant. `syncAgents()` could be inlined. | ~80 |
| `hooks/useSprites.ts` | Used by `CustomizerModal` only, which is fine. But `spriteCache` duplicates `AgentRenderer.ts`'s own `spriteCache`. | — |
| `lib/waypoints.ts` | Most of the file (no-go tiles, claiming, distance, nearest-waypoint) is dead — only `createWaypointSet()` and `getAllWaypoints()` are used for waypoint type inference in `useAgents.ts`. | ~300 |
| `types/index.ts` | `TilemapData`, `AgentProfile`, `CameraState`, `TileOffset` — mostly unused or redundant with shared types. | — |

**Estimated dead code: ~1,100 lines (roughly 20% of the frontend).**

### Over-Complexity

1. **`useAgents.ts` movement event handling** (~160 lines for `agent:movement` case). The logic for: checking backend authority, normalizing positions, writing to smooth targets, buffering Zustand updates, inferring movement state from waypoint type, handling released authority — this is a single case statement with 8 conditional branches. It needs extraction into a `MovementEventHandler` class or module.

2. **`agentsStore.ts` `updateAgent` method** (~40 lines). The merge logic with explicit `??` checks for every field is fragile. If a new field is added to `StoreAgent`, it must be manually added to this merge function. A shallow merge utility would be safer.

3. **`agentsStore.ts` `setAgents` method** (~50 lines). The `keepLocalPlacement` logic that preserves walking state during full agent list replacement is a workaround for the now-dead frontend movement system. Since movement is server-authoritative, this can be simplified to a simple map-and-normalize.

4. **`AgentRenderer.ts` glow effect system**. The `getGlowCanvases` function does per-pixel edge detection to create outline and outer glow canvases, caches them with a key derived from `sprite.toDataURL().slice(-32)` (slow), and applies shadow blur in the render loop. For a selection indicator, this is massively over-engineered. A simple colored rectangle or circle would work.

### Missing Error Handling

1. **WebSocket message parsing** (`useWebSocket.ts` line ~80): Malformed JSON is silently caught with an empty `catch {}`. No logging, no metric. If the backend sends a malformed message during debugging, there's zero visibility.

2. **API errors** (`api.ts`): The retry logic is good (2 retries with timeout), but there's no distinction between server errors (5xx, retryable) and client errors (4xx, not retryable). All errors are retried equally.

3. **Sprite loading failures** (`AgentRenderer.ts`): If a sprite fails to load, the agent simply doesn't render. No placeholder, no error state, no retry.

4. **Canvas context acquisition** (`OfficeCanvas.tsx`): Multiple `getContext('2d')` calls without null checks after the initial setup. If the context is lost (GPU reset), the app will silently break.

### Performance Concerns

1. **Glow cache key uses `sprite.toDataURL()`** (`AgentRenderer.ts` line ~78). `toDataURL()` encodes the entire image as a PNG base64 string, then slices the last 32 chars. This is O(width×height) per call and runs for every agent on every frame during selection. Should use dimensions + a hash or just the template name.

2. **`debugAgent` calls in render loop** (`OfficeCanvas.tsx` draw function, `AgentRenderer.ts` render method). Even though `isDebugAgent()` returns false in production, the function call overhead exists. More importantly, the debug logging in `AgentRenderer.render()` uses `(window as any).__renderLogT` which is a global mutable — potential for subtle bugs if multiple tabs are open.

3. **`CustomizerModal` converts canvas frames to `dataURL` for `<img>` tags**. Each preview direction renders via `spriteSheet[direction][frame].toDataURL()`. For 4 directions × 3 frames cycling at 350ms, this creates 12 `toDataURL()` calls per cycle. Should use `<canvas>` elements directly or blob URLs.

4. **Zustand `updateAgent` triggers re-render for all subscribers**. `AgentPanel` subscribes to the full agents array. Every throttled movement update (8Hz × N agents) causes `AgentPanel` to re-render even when the selected agent hasn't changed. Should use a selector: `useAgentsStore(s => s.agents.find(a => a.id === selectedId))`.

5. **`useAllSpritePreviews` loads all 11 sprite sheets on mount**. Each `loadSpriteTemplate` extracts 12 frames via canvas draw operations. This is ~132 canvas operations on initial render, blocking the main thread. Should be deferred or lazy-loaded.

6. **`StaffView` rebuilds the entire dagre graph on every agents change** via `useMemo`. Since `visibleAgents` is a filtered slice of the store, any agent status change triggers a full graph recomputation including layout.

### Type Safety

- **`EventPayloadMap` in `useAgents.ts`** is good — explicit typing for each WebSocket event type.
- **`agentMovementBuffer` uses `Map<string, any>`** — loses all type information.
- **`AgentRenderer.ts` render overrides use a plain Map** — no type enforcement that override keys match agent IDs.
- **Backend shared types (`@pixdash/shared`)** are used consistently in the frontend — this is well done.
- **`CustomizerModal` casts `bodyType: preset.bodyType as Appearance['bodyType']`** — unsafe cast, no runtime validation.

---

## 4. Frontend Feature Gaps

### What the UI Promises But Doesn't Deliver

1. **"Controls: Drag to pan · Scroll to zoom · Click agents"** — accurate but incomplete. No mention that clicking an agent replaces the entire sidebar. No undo affordance.

2. **"Scene info / Office layout"** section in the sidebar — this is a static label that provides no actual scene information. It promises content but delivers nothing.

3. **Settings section has "Agent Names" toggle** — this works but there's no way to toggle other display options like status indicators, shadows, or debug overlays.

4. **The `Camera` debug panel** shows zoom and pan values — useful for devs but not for end users. The "Selected" badge is the only end-user-relevant element in the canvas overlays.

### Missing User Controls

1. **No way to search/filter agents** — the roster is a flat list sorted alphabetically. With 6+ agents, this is fine. With 20+, it becomes unwieldy.

2. **No keyboard shortcuts** — no `Escape` to close panel, no `Tab` to cycle agents, no `Space` to pause/resume, no `/` to search.

3. **No way to zoom to a specific agent** — double-click or context menu to "focus" on an agent is missing.

4. **No activity timeline** — the LogViewer shows flat logs sorted by time. There's no way to see a chronological timeline of what an agent has been doing (status changes + tasks + movement).

5. **No notification when an agent goes offline/online** — users have to actively watch the roster to notice status changes.

6. **Customizer only allows preset selection** — despite having a full `Appearance` type with hair, skin, outfit, and accessories, the UI only lets you pick a character preset. The granular customization fields from `sprite-generator.ts` (hair color, skin color, outfit color, accessories) are unused in the UI.

### Incomplete Interactions

1. **Staff view nodes are not clickable**. `nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={false}` — you can't click a node to see agent details. This is a dead end for the user.

2. **Staff view fit button** calls `setFitSignal` which increments a counter. The `StaffFlowWithSignal` wrapper handles this, but the `StaffFlow` component's internal `hasFitted` ref means the initial fit only fires once. If the component unmounts and remounts (e.g., view switch), the initial fit won't fire again because `mounted` state is reset but `hasFitted` is inside the inner component that also remounts — actually this works. But the fit-on-mount is inside a `useEffect` with `reactFlow` as dependency, which may cause double-fits.

3. **Agent panel "Customize" button** opens the modal, but changes require a page reload to see on the Staff view because `StaffView` reads from the same store but `AgentNodeCard` reads `bodyType` directly.

---

## 5. Recommendations

### Priority 1: Delete Dead Code (Immediate)

Remove these files entirely or gut them:

| Action | File | Reason |
|--------|------|--------|
| **Delete** | `lib/sprite-generator.ts` | 300 lines, zero consumers |
| **Delete** | `lib/pathfinding.ts` | Unused after server-authoritative migration |
| **Delete** | `lib/collisionMap.ts` | Collision map not needed client-side |
| **Delete** | `lib/tilemap-loader.ts` | Unused |
| **Delete** | `components/canvas/TilemapRenderer.ts` + `.tsx` | Canvas uses background image |
| **Delete** | `store/movementStore.ts` | All methods are no-ops or redundant |
| **Gut** | `lib/waypoints.ts` | Keep only type definitions and the `WaypointType` type. Remove all coordinate data, no-go tiles, claiming logic, distance/picking functions |
| **Gut** | `lib/movement.ts` | Keep only `getWalkFrameIndex()`, `getArrivalStateForMovementType()`, `tileToPixelCenter()`, `pixelToTile()` |

**Impact**: Remove ~1,100 lines of dead code. Zero risk since nothing references these.

### Priority 2: Fix State Management (Before Adding Features)

1. **Delete `smoothPositionTargets` Map and `movementStore.tick()`**. Replace with a proper `requestAnimationFrame` interpolation system inside `OfficeCanvas`:
   - Store backend position targets in Zustand with `fractionalX/Y` 
   - In the draw loop, interpolate from last rendered position to target using delta time
   - This eliminates the dual-state problem and gives the panel access to the same data

2. **Add selectors to `AgentPanel`** to avoid re-rendering on unrelated agent changes:
   ```ts
   const selectedAgent = useAgentsStore(
     useCallback(s => s.agents.find(a => a.id === selectedAgentId), [selectedAgentId])
   );
   ```

3. **Remove `uiStore` duplication** — pick either `panelOpen` or `isCustomizerOpen`, not both.

### Priority 3: Fix the `useAgents` Hook (Before Scaling)

Extract the WebSocket event handling into a pure function:

```
useAgents.ts (140 lines)
  → useWebSocket.ts (unchanged)
  → agentEventProcessor.ts (new, ~200 lines, pure functions)
  → positionInterpolation.ts (new, ~60 lines, replaces smoothPositionTargets)
```

The `agent:movement` case alone should be its own function. The current 160-line case block is the #1 source of bugs in this codebase.

### Priority 4: UX Improvements (User-Facing)

1. **Remove debug overlays by default**. Add a `?debug=1` query parameter check or a keyboard shortcut (`D`) to toggle debug info panels.

2. **Add `Escape` key to close panel/customizer**. Currently only the close button works.

3. **Make Staff view nodes clickable** to open the agent panel. Set `elementsSelectable={true}` and handle `onNodeClick`.

4. **Add a "back to roster" button** when the agent panel is open. The current UX of clicking empty space is not discoverable.

5. **Add a status filter** to the agent roster (All / Online / Working / Idle / Offline).

6. **Add URL routing** (`#/office`, `#/staff`, `#/agent/:id`) so views are bookmarkable.

### Priority 5: Performance Optimizations

1. **Replace glow `toDataURL` cache key** with `{width}:{height}:{templateName}`. The template name is deterministic and avoids O(pixels) string encoding.

2. **Lazy-load `useAllSpritePreviews`** — only trigger when the customizer modal opens, not on every page load.

3. **Use `React.memo` on `AgentNodeCard`** in Staff view to prevent unnecessary re-renders when other agents change.

4. **Debounce `StaffView` dagre layout computation** — don't rebuild on every status change. Rebuild only when agents are added/removed.

### Priority 6: Accessibility (If This Ships to Users)

1. Add `aria-label` to the canvas describing the office scene and agent count.
2. Add `role="complementary"` and `aria-label="Agent details"` to the sidebar.
3. Add keyboard navigation to the agent roster (arrow keys, Enter to select).
4. Add focus trap to `CustomizerModal`.
5. Add `prefers-reduced-motion` media query to disable canvas animations.

---

## Summary

**Architecture**: The dual-state system (Zustand + module-level Map) for position data is the biggest architectural flaw. It creates subtle inconsistencies between what the panel shows and what the canvas renders. The fix is straightforward: interpolate in the draw loop using Zustand-stored targets, eliminating the Map.

**Dead Code**: ~20% of the frontend is dead weight from the server-authoritative migration. Clean removal is risk-free and improves maintainability.

**UX**: The app looks great and the SNES aesthetic is well-executed. But it's observation-only with minimal interaction. The debug overlays are visible to end users. Staff view nodes aren't clickable. There's no keyboard navigation.

**Code Quality**: The `useAgents` hook is the main hot spot — it's doing 5 different jobs. The `sprite-generator.ts` is 300 lines of unused procedural pixel art. The glow effect system is over-engineered for a selection indicator.

**Ship-readiness**: The core features (live agent visualization, WebSocket real-time updates, canvas rendering) work well. But the dead code, debug overlays, accessibility gaps, and state management complexity should be addressed before treating this as a finished product.
