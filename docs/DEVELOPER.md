# PixDash — Developer / Integration Guide

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Codebase Architecture](#2-codebase-architecture)
3. [State Management](#3-state-management)
4. [Adding New Features](#4-adding-new-features)
5. [API Endpoints](#5-api-endpoints)
6. [WebSocket Events](#6-websocket-events)
7. [Contributing Guidelines](#7-contributing-guidelines)
8. [Development Workflow](#8-development-workflow)

---

## 1. Project Structure

PixDash is a **pnpm monorepo** with three packages:

```
pixdash/
├── package.json                 # Root: pnpm workspace config, scripts
├── pnpm-workspace.yaml          # packages/*
├── Dockerfile                   # Production Docker build
├── start.sh                     # Production start script
├── pixdash.example.json         # Configuration example
│
├── assets/
│   ├── collision-grid.json      # Pre-computed walkable tile grid (75×56)
│   ├── office-palette.json      # Office color palette
│   ├── blocked.png              # Collision map (white = walkable, black = blocked)
│   ├── sprites/
│   │   ├── office.png           # Office background sprite (2400×1792)
│   │   ├── michael.png          # Agent sprite sheets (2048×2048, 3 cols × 4 rows)
│   │   ├── angela.png
│   │   ├── creed.png
│   │   ├── ... (11 character sprites)
│   │   └── blocked.png          # Also referenced by CollisionGridLoader
│   └── palettes/
│       ├── hair-colors.json
│       ├── outfit-colors.json
│       └── skin-tones.json
│
├── packages/
│   ├── shared/                  # Shared TypeScript types & constants
│   │   ├── src/
│   │   │   ├── index.ts         # Re-exports all types
│   │   │   ├── types/
│   │   │   │   ├── agent.ts     # Agent, Appearance, Position, AgentStatus
│   │   │   │   ├── event.ts     # WebSocket event types, payloads
│   │   │   │   ├── movement.ts  # MovementAuthorityState, MoveAgentRequest
│   │   │   │   └── tilemap.ts   # Tilemap interface
│   │   │   ├── constants/
│   │   │   │   ├── defaults.ts  # DEFAULT_APPEARANCE, DEFAULT_POSITION
│   │   │   │   └── colors.ts    # Color constants
│   │   │   └── schemas/
│   │   │       ├── tilemap.schema.json
│   │   │       └── appearance.schema.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── backend/                 # Fastify + WebSocket server
│   │   ├── src/
│   │   │   ├── server.ts        # Entry point: buildServer(), main()
│   │   │   ├── routes/
│   │   │   │   ├── agents.ts    # /api/v1/agents endpoints
│   │   │   │   ├── config.ts    # /api/v1/config endpoint
│   │   │   │   ├── health.ts    # /api/v1/health endpoint
│   │   │   │   └── office.ts    # /api/v1/office/layout endpoint
│   │   │   ├── services/
│   │   │   │   ├── AgentStateManager.ts  # Core agent state, event broadcasting
│   │   │   │   ├── MovementEngine.ts     # A* pathfinding, wander, collision
│   │   │   │   ├── PathfindingService.ts # A* implementation
│   │   │   │   ├── GatewayClient.ts      # OpenClaw Gateway WebSocket client
│   │   │   │   ├── AppearanceStore.ts    # JSON file persistence
│   │   │   │   ├── CollisionGridLoader.ts# blocked.png → boolean[][] grid
│   │   │   │   └── ConfigWatcher.ts      # Watches openclaw.json + SOUL/IDENTITY
│   │   │   ├── websocket/
│   │   │   │   ├── server.ts    # PixDashWebSocketServer (Fastify WS)
│   │   │   │   └── handlers.ts  # sync, updateAppearance, moveAgent
│   │   │   ├── data/
│   │   │   │   ├── waypoints.ts # BACKEND_WAYPOINTS array (desks, conference, etc.)
│   │   │   │   └── noGoTiles.ts # Impermissible tile coordinates
│   │   │   ├── config/
│   │   │   │   ├── index.ts     # loadConfig()
│   │   │   │   ├── pixdashConfig.ts  # Runtime config singleton
│   │   │   │   └── defaults.ts  # Default values
│   │   │   ├── schemas/         # JSON Schema validation
│   │   │   │   ├── agent.schema.json
│   │   │   │   ├── event.schema.json
│   │   │   │   └── appearance.schema.json
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts    # createLogger()
│   │   │   │   └── validation.ts# JSON Schema validators
│   │   │   └── types/
│   │   │       └── index.ts     # PixDashFastifyInstance, internal types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                # React 18 + Vite 5 + Tailwind CSS
│       ├── src/
│       │   ├── main.tsx         # ReactDOM entry point
│       │   ├── App.tsx          # Root: useAgents → AppLayout
│       │   ├── index.css        # Tailwind directives + custom CSS
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   └── AppLayout.tsx  # Main layout: header, canvas, panel
│       │   │   ├── canvas/
│       │   │   │   ├── OfficeCanvas.tsx   # HTML5 Canvas container + draw loop
│       │   │   │   ├── AgentRenderer.ts   # Agent sprite rendering class
│       │   │   │   ├── CameraController.ts# Pan/zoom camera
│       │   │   │   ├── TilemapRenderer.ts # Tilemap rendering (unused in prod)
│       │   │   │   └── TilemapRenderer.tsx
│       │   │   ├── staff/
│       │   │   │   ├── NavigationSwitch.tsx  # Office/Staff tab switcher
│       │   │   │   ├── StaffView.tsx         # Staff directory view
│       │   │   │   ├── AgentNodeCard.tsx     # Agent card in staff view
│       │   │   │   └── spriteUrls.ts
│       │   │   └── ui/
│       │   │       ├── AgentPanel.tsx    # Selected agent detail sidebar
│       │   │       ├── AgentStatus.tsx   # Status badge component
│       │   │       ├── CustomizerModal.tsx # Appearance editor modal
│       │   │       ├── LogViewer.tsx     # Agent log viewer
│       │   │       ├── TaskViewer.tsx    # Agent task viewer
│       │   │       └── ConfigViewer.tsx  # Config display
│       │   ├── store/
│       │   │   ├── agentsStore.ts   # Zustand: agent list, selection
│       │   │   ├── movementStore.ts # Zustand: waypoints, movement tick
│       │   │   ├── settingsStore.ts # Zustand: theme, zoom, labels (persisted)
│       │   │   ├── configStore.ts   # Zustand: pixdash.json config
│       │   │   └── uiStore.ts       # Zustand: panel, customizer, sidebar
│       │   ├── hooks/
│       │   │   ├── useAgents.ts     # Agent loading + WebSocket event processing
│       │   │   ├── useCanvas.ts     # requestAnimationFrame loop
│       │   │   ├── useSprites.ts    # Sprite sheet loading + caching
│       │   │   ├── useWebSocket.ts  # WebSocket connection management
│       │   │   ├── useAllSpritePreviews.ts
│       │   │   └── useTimezone.ts   # Timezone preference
│       │   ├── lib/
│       │   │   ├── api.ts           # REST API client (fetch wrapper)
│       │   │   ├── movement.ts      # tile/pixel conversion, walk frames
│       │   │   ├── spriteSheets.ts  # Sprite sheet extraction, caching
│       │   │   ├── sprite-generator.ts # Procedural sprite generation
│       │   │   ├── waypoints.ts     # Frontend waypoint definitions
│       │   │   ├── officeScene.ts   # Office dimensions, scene constants
│       │   │   ├── tilemap-loader.ts
│       │   │   ├── debug.ts         # Debug logging helpers
│       │   │   └── utils.ts         # cn() classname helper
│       │   └── types/
│       │       └── index.ts         # AgentPosition, MovementState, PixdashConfig
│       ├── vite.config.ts           # Vite aliases: @/ → src, @assets/ → ../../assets
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── tsconfig.json
│       ├── index.html
│       └── package.json
│
└── scripts/                     # QA test scripts
    ├── live-qa-v2.mjs
    └── live-qa-v4.js
```

### Key Configuration Files

| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Defines `packages/*` as workspace members |
| `packages/frontend/vite.config.ts` | Vite config with `@/` and `@assets/` aliases |
| `packages/frontend/tsconfig.json` | TypeScript path aliases |
| `pixdash.example.json` | Runtime config: display names, roles, hierarchy, reserved waypoints |
| `assets/collision-grid.json` | 75×56 boolean walkable grid (auto-generated from `blocked.png`) |

---

## 2. Codebase Architecture

### Frontend Architecture

**Stack:** React 18 + Vite 5 + Tailwind CSS + Zustand

#### Component Hierarchy

```
App.tsx
└── AppLayout.tsx
    ├── Header (inline)
    │   ├── NavigationSwitch.tsx   ← Office / Staff tab toggle
    │   └── Stats (agent count, connection status)
    ├── [viewMode === 'office']
    │   └── OfficeCanvas.tsx       ← HTML5 Canvas with rAF loop
    │       └── AgentRenderer.ts   ← Sprite rendering class
    ├── [viewMode === 'staff']
    │   └── StaffView.tsx
    │       └── AgentNodeCard.tsx
    ├── AgentPanel.tsx             ← Sidebar (selected agent details)
    │   ├── AgentStatus.tsx
    │   ├── LogViewer.tsx
    │   ├── TaskViewer.tsx
    │   └── ConfigViewer.tsx
    └── CustomizerModal.tsx        ← Appearance editor overlay
```

#### HTML5 Canvas Rendering Pipeline

`OfficeCanvas.tsx` manages the full rendering loop:

1. **`useCanvas` hook** starts a `requestAnimationFrame` loop
2. Each frame calls `draw()` which:
   - Clears canvas, draws dark gradient background
   - Applies `CameraController` transform (pan/zoom)
   - Draws `office.png` background
   - Computes **render overrides** using `smoothPositionTargets` map
   - Passes agents + overrides to `AgentRenderer.render()`

#### Sprite Rendering Pipeline

```
assets/sprites/{character}.png (2048×2048 sprite sheet)
        ↓
loadSpriteTemplate() in spriteSheets.ts
        ↓
extractSheetFrames() → splits into 4 rows (directions) × 3 cols (frames)
        ↓
centerAlignFrame() → center-crops each frame
        ↓
Map<Direction, SpriteFrameCanvas[]> (SpriteSheetFrames)
        ↓
AgentRenderer.render() → ctx.drawImage(sprite, drawX, drawY, 235, 177)
```

Direction-to-row mapping: `['south', 'north', 'west', 'east']`
Frame selection: frame 0 = standing, frames 1,2 = alternating walk cycle (toggled every 180ms)

#### View System

Two views toggled by `NavigationSwitch`:

- **Office view** — Canvas-based office floor with walking agents
- **Staff view** — `StaffView.tsx` grid of `AgentNodeCard` components

View mode is persisted to `localStorage` under key `pixdash-view`.

#### Smooth Position Interpolation

Movement is **server-authoritative**. The frontend interpolates smoothly:

1. Backend broadcasts `agent:movement` events at ~20Hz with `fractionalX`/`fractionalY` (sub-tile pixel positions)
2. Frontend `useAgents` hook writes to `smoothPositionTargets` — a **module-level `Map`** (NOT Zustand)
3. `OfficeCanvas.draw()` reads from `smoothPositionTargets` each frame
4. When a backend event arrives, the canvas immediately picks it up on next `requestAnimationFrame`

Zustand store updates for movement are **throttled to ~8Hz** (`STORE_FLUSH_INTERVAL_MS = 125`) to avoid excessive React re-renders. Terminal state changes (seated, idle) flush immediately.

### Backend Architecture

**Stack:** Fastify + @fastify/websocket + @fastify/static + @fastify/cors

> **Key principle: Backend is movement-authoritative.** All collision maps, A* pathfinding, movement ticks (20Hz), waypoint claims, idle wandering, status→destination routing, and conference seating are handled server-side. The frontend is render-only — it receives `agent:movement` events and applies lerp interpolation for smooth visuals. No client-side pathfinding or movement logic exists.

#### Server Bootstrap (`server.ts`)

```typescript
buildServer():
  1. loadConfig() → pixdashConfig
  2. AppearanceStore.init() → loads appearances JSON file
  3. loadOfficeLayoutWithCollisionGrid() → loads tilemap + collision grid
  4. AgentStateManager(appearanceStore, officeLayout) → creates state manager + movement engine
  5. PixDashWebSocketServer(app) → registers /ws endpoint
  6. agentStateManager.subscribe() → broadcasts events to all WS clients
  7. ConfigWatcher.start() → watches openclaw.json, SOUL.md, IDENTITY.md
  8. GatewayClient.start() → connects to OpenClaw Gateway WS
  9. Registers REST routes (health, agents, office, config)
  10. In production: serves frontend/dist as static files
```

#### Service Layer

| Service | Responsibility |
|---------|---------------|
| `AgentStateManager` | Core state: agent CRUD, status derivation, event broadcasting, movement coordination |
| `MovementEngine` | A* pathfinding, wander scheduling (60–90s), collision avoidance, conference seat assignment |
| `PathfindingService` | Pure A* implementation (`findPath()`), 4-directional, with no-go tile support |
| `GatewayClient` | WebSocket client to OpenClaw Gateway: authentication (Ed25519 device keys), event forwarding, session subscription |
| `AppearanceStore` | JSON file persistence for agent appearances and display names |
| `CollisionGridLoader` | Generates `boolean[][]` walkable grid from `blocked.png` using sharp (brightness threshold) |
| `ConfigWatcher` | Watches `openclaw.json` + per-agent SOUL.md/IDENTITY.md via chokidar, applies config snapshots |

#### Movement Tick System

- **Tick interval:** 50ms (20Hz) — `MOVEMENT_TICK_INTERVAL_MS`
- **Speed:** 5 tiles/second — `MOVEMENT_SPEED_TILES_PER_SECOND`
- **Progress increment per tick:** `0.25` tiles
- **Wander delay:** 60–90 seconds for idle agents
- **Status re-evaluation:** Every 30 seconds
- **Settled state broadcast:** Every 5 seconds for non-moving agents

Flow per tick:
1. `MovementEngine.movementTick()` iterates all agents
2. For moving agents: increment `progress`, step through path nodes
3. Compute `fractionalX`/`fractionalY` for sub-tile interpolation
4. On path completion: set status to `seated` (if at waypoint) or `idle`
5. Call `AgentStateManager.emitMovement()` → broadcasts to all WS clients

#### Waypoint and Routing System

Waypoints are defined in `packages/backend/src/data/waypoints.ts` as `BACKEND_WAYPOINTS`:

- **Types:** `desk` (28), `reception` (8), `restroom` (8), `conference` (12), `dining` (1)
- Each waypoint has: `id`, `x`, `y`, `type`, `direction`, `visualOffsetX/Y`, `reservedFor`
- Waypoints use the `seated()` helper which auto-computes visual offsets based on facing direction
- `reservedFor` assigns specific agents to specific desks (via `pixdash.json`)

Status-based routing:
- `working` → route to nearest available `desk` (or reserved desk)
- `online` → route to nearest available `desk`
- `idle` → schedule wander (weighted random: desk 35%, reception 30%, restroom 20%, dining 15%)
- `conference` → route to conference room seats
- `offline` → cancel movement, release waypoint claim

Collision avoidance:
- `occupiedTiles` map tracks tiles held by seated/idle agents
- Moving agents encountering blocked tiles attempt reroute with dynamic no-go set
- Blocked for >5s → movement cancelled

### Shared Types

`@pixdash/shared` provides all shared TypeScript types:

**Agent types (`agent.ts`):**
- `Agent` — full agent with position, appearance, config, stats, logs, tasks, soul, identity
- `Appearance` — bodyType, hair (style+color), skinColor, outfit (type+color), accessories
- `Position` — x, y, direction
- `AgentStatus` — `'working' | 'online' | 'idle' | 'offline' | 'busy' | 'conference'`
- `BodyType` — `'male' | 'female' | 'neutral' | 'michael' | 'angela' | ...` (11 named characters)

**Movement types (`movement.ts`):**
- `MovementAuthorityState` — status, claimedWaypointId, destination, path, progress, fractionalX/Y, visualOffsetX/Y
- `MovementAuthorityStatus` — `'idle' | 'moving' | 'seated'`
- `MoveAgentRequest` — agentId, waypointId?, destination?, direction?
- `AgentMovementEventPayload` — the broadcast payload

**Event types (`event.ts`):**
- All WebSocket event payload interfaces
- `WsConnectedMessage`, `WsRequestMessage`, `WsResponseMessage`, `WsEventMessage`
- `SyncPayload` — initial sync response

**Tilemap types (`tilemap.ts`):**
- `Tilemap` — width, height, tileSize, layers (floor/furniture/walls), walkable

Type flow: `@pixdash/shared` → imported by both `frontend` and `backend` packages.

---

## 3. State Management

### Zustand Stores

| Store | File | What it manages | Persistence |
|-------|------|----------------|-------------|
| `useAgentsStore` | `store/agentsStore.ts` | Agent list, selection, display name updates | No |
| `useMovementStore` | `store/movementStore.ts` | Frontend waypoint set, movement tick (now no-op for server-authoritative) | No |
| `useSettingsStore` | `store/settingsStore.ts` | Theme (dark/light), zoom level, showLabels toggle | `localStorage` (`pixdash-settings`) |
| `useConfigStore` | `store/configStore.ts` | `pixdash.json` display names, roles, hierarchy | No (fetched from API) |
| `useUIStore` | `store/uiStore.ts` | Panel open/close, active tab, customizer modal, sidebar collapse | No |

### How WebSocket Events Update State

The `useAgents` hook in `hooks/useAgents.ts` bridges WebSocket events to stores:

1. **Initial load:** Fetches `GET /api/v1/agents` → `agentsStore.setAgents()`
2. **Event processing:** Each `eventsVersion` change drains `useWebSocket.drainEvents()` queue
3. **Event routing:**
   - `agent:status` / `agent.status` → `agentsStore.updateAgent({ status })` + `movementStore.handleStatusChange()`
   - `agent:log` / `agent.log` → `agentsStore.updateAgent({ logs })`
   - `agent:task` / `agent.task` → `agentsStore.updateAgent({ tasks })`
   - `agent:appearance` → `agentsStore.updateAgent({ appearance })`
   - `agent:config` → `agentsStore.updateAgent()` (full agent update)
   - `agent:conference` → `movementStore.handleConference()`
   - `agent:position` → Updates `smoothPositionTargets` + throttled store flush
   - `agent:movement` → Updates `smoothPositionTargets` + `recentMovingAgents` + throttled store flush

### The Smooth Position System

**Critical design:** High-frequency position data bypasses Zustand entirely.

```typescript
// hooks/useAgents.ts — module-level, NOT in React/Zustand
export const smoothPositionTargets = new Map<
  string,
  { x: number; y: number; direction?: Direction; moving: boolean }
>();
```

Write path:
1. WebSocket `agent:movement` event arrives in `useAgents` hook
2. `fractionalX`/`fractionalY` (backend pixel positions) written to `smoothPositionTargets`
3. `recentMovingAgents` updated with timestamp (for reconnection protection)

Read path:
1. `OfficeCanvas.draw()` reads `agentsStore.getState().agents` + `smoothPositionTargets`
2. For each agent: if `smoothPositionTargets` has an entry with `moving: true`, use those coordinates
3. If not moving, fall back to `agent.interpolatedX/Y` or `agent.x/y`

Throttled Zustand flush (~8Hz):
- `agentMovementBuffer` collects movement updates
- Terminal states (seated, idle) flush immediately
- Non-terminal states flush at `STORE_FLUSH_INTERVAL_MS = 125ms`

### Config Store and pixdash.json

`configStore` fetches `GET /api/v1/config` on mount and exposes:
- `displayNames: Record<string, string>` — agent ID → custom display name
- `roles: Record<string, string>` — agent ID → role label
- `hierarchy: unknown[]` — organizational hierarchy

The store also provides mutation methods that call the config API and persist to `pixdash.json`:
- `updateDisplayName(agentId, displayName)` → `PATCH /api/v1/config/displayNames`
- `updateRole(agentId, role)` → `PATCH /api/v1/config/roles`
- `updateHierarchy(child, newParent)` → `PATCH /api/v1/config/hierarchy`
- `resetToDefaults()` → `POST /api/v1/config/reset`

Display names are applied to agents during initial load and re-applied when config finishes loading (race condition protection via `configStore.subscribe`).

---

## 4. Adding New Features

### How to Add a New View/Tab

1. **Create the view component** in `packages/frontend/src/components/staff/` (or a new directory):
   ```typescript
   // components/myview/MyView.tsx
   export function MyView() { ... }
   ```

2. **Add to `NavigationSwitch`** in `components/staff/NavigationSwitch.tsx`:
   ```typescript
   export type ViewMode = 'office' | 'staff' | 'myview';
   
   // Add a new button alongside Office and Staff
   <button onClick={() => onChange('myview')}>📊 My View</button>
   ```

3. **Wire into `AppLayout`** in `components/layout/AppLayout.tsx`:
   ```typescript
   import { MyView } from '@/components/myview/MyView';
   
   {viewMode === 'myview' ? (
     <MyView />
   ) : viewMode === 'staff' ? (
     <StaffView />
   ) : (
     // ... office canvas
   )}
   ```

### How to Add a New Agent Panel/Feature

1. **Backend:**
   - Add route in `packages/backend/src/routes/agents.ts`
   - Add service method in `AgentStateManager.ts` if state changes are needed
   - Broadcast via `this.broadcast('agent:myevent', payload)` to push to all WebSocket clients

2. **Frontend:**
   - Add API function in `lib/api.ts`
   - Add component in `components/ui/`
   - Wire into `AgentPanel.tsx`

3. **WebSocket event:**
   - Add payload type in `packages/shared/src/types/event.ts`
   - Add to `FrontendEventName` union and `FrontendEventPayload` union
   - Handle in `useAgents` hook event switch
   - Add to `SUPPORTED_EVENTS` set in `useWebSocket.ts`

### How to Add New Waypoint Types

1. **Backend:** Add to `packages/backend/src/data/waypoints.ts`:
   ```typescript
   export type BackendWaypointType = 'desk' | 'reception' | 'restroom' | 'conference' | 'dining' | 'breakroom';
   
   // Add waypoints to BACKEND_WAYPOINTS array
   seated('breakroom-1', 10, 10, 'breakroom', 'south'),
   ```

2. **MovementEngine routing:** Add the type to `SEATED_TYPES` and optionally `WANDER_WEIGHTS`:
   ```typescript
   const SEATED_TYPES = new Set<BackendWaypointType>(['desk', 'reception', 'restroom', 'conference', 'dining', 'breakroom']);
   ```

3. **Frontend:** Update `lib/waypoints.ts` and `lib/movement.ts` (`getArrivalStateForMovementType`) if the new type needs a visual state.

4. **No-go tiles:** Add blocked tiles in `packages/backend/src/data/noGoTiles.ts` if needed.

5. **Config:** Add to `pixdash.json` if agents can be reserved to this waypoint type.

---

## 5. API Endpoints

All endpoints are prefixed with `/api/v1`. **No authentication** — local only.

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| `GET` | `/api/v1/health` | Health check | — | `{ ok: true, service: "pixdash-backend" }` |
| `GET` | `/api/v1/agents` | List all agents | — | `{ agents: Agent[] }` |
| `GET` | `/api/v1/agents/:id` | Get single agent | — | `Agent` |
| `GET` | `/api/v1/agents/:id/logs` | Get agent logs | Query: `?limit=N&offset=N&level=info` | `{ logs: AgentLog[], total: number, hasMore: boolean }` |
| `GET` | `/api/v1/agents/:id/tasks` | Get agent tasks | — | `{ tasks: AgentTask[] }` |
| `PATCH` | `/api/v1/agents/:id/appearance` | Update agent appearance | `AppearancePatch` | `{ success: true, appearance: Appearance }` |
| `PATCH` | `/api/v1/agents/:id/displayName` | Update display name | `{ displayName: string \| null }` | `{ success: true, displayName: string \| null }` |
| `GET` | `/api/v1/office/layout` | Get office tilemap | — | `Tilemap` |
| `GET` | `/api/v1/config` | Get public config | — | `PixdashConfig` |
| `PATCH` | `/api/v1/config/displayNames` | Update agent display name | `{ agentId, displayName }` | `{ success, displayNames }` |
| `PATCH` | `/api/v1/config/roles` | Update agent role title | `{ agentId, role }` | `{ success, roles }` |
| `PATCH` | `/api/v1/config/hierarchy` | Reassign agent's parent | `{ child, newParent }` | `{ success, hierarchy }` |
| `POST` | `/api/v1/config/reset` | Reset config to startup defaults | — | `{ success, displayNames, roles, hierarchy }` |

**Notes:**
- `GET /api/v1/agents` strips sensitive fields (`soul`, `identity`, `config.workspace`, `config.agentDir`, `config.source`, `config.model`)
- `PATCH /api/v1/agents/:id/appearance` validates against `appearance.schema.json`
- Agent responses return `structuredClone()` copies — safe to mutate on the client

---

## 6. WebSocket Events

### Connection

**Endpoint:** `ws://<host>/ws`

On connect, server sends:
```json
{ "type": "connected", "clientId": "uuid", "serverVersion": "1.0.0" }
```

### Client → Server Requests

| Method | Params | Response |
|--------|--------|----------|
| `sync` | — | `{ agents: Agent[], officeLayout: Tilemap }` |
| `updateAppearance` | `{ agentId, appearance }` | `{ appearance: Appearance }` |
| `moveAgent` | `MoveAgentRequest` | `{ ok: true, agent: Agent }` |

Request format:
```json
{ "type": "req", "id": "req_001", "method": "sync" }
```

### Server → Client Events

| Event Name | Payload | Trigger |
|------------|---------|---------|
| `agent:status` | `{ agentId, status, timestamp }` | Agent status change (gateway event, status re-evaluation, activity decay) |
| `agent:log` | `{ agentId, log: AgentLog }` | New log entry from Gateway |
| `agent:task` | `{ agentId, task: AgentTask }` | Task update from Gateway |
| `agent:appearance` | `{ agentId, appearance }` | Appearance updated via API or store |
| `agent:config` | `{ agentId, agent }` | Config watcher applies new snapshot |
| `agent:conference` | `{ agentIds[], sessionKey?, source?, timestamp }` | Multi-agent session detected |
| `agent:position` | `{ agentId, position, direction? }` | Position change broadcast (supplementary) |
| `agent:movement` | `{ agentId, movement: MovementAuthorityState, position }` | Movement tick update (20Hz for moving, 5s for settled) |

Event format:
```json
{ "type": "event", "event": "agent:movement", "payload": { ... } }
```

### Heartbeat

Frontend sends `{ "type": "ping" }` every 15s. Connection is reset if no server message received for 45s.

---

## 7. Contributing Guidelines

### Branch Naming

- `dev` — development branch
- `main` — stable/release branch

### Commit Message Format

No enforced convention currently. Use clear, descriptive messages.

### PR Process

Standard fork → branch → PR workflow via GitHub.

### Code Style

- **TypeScript strict mode** across all packages
- **ESLint** — configured per package (see `tsconfig.json`)
- Path aliases: `@/` → `src/`, `@assets/` → `../../assets/` (frontend only)
- Import shared types via `@pixdash/shared`

### Retro Visual Theme

PixDash uses a pixel-art/retro aesthetic throughout the frontend:

- **Fonts**: Press Start 2P (headings, labels) + Space Mono (body text, code)
- **CRT overlay**: Scanline effect via CSS `::after` pseudo-element on `<body>`
- **CSS classes**: `pixel-frame`, `pixel-button`, `pixel-inset` for retro-styled UI elements
- **Color palette**: Dark backgrounds (`#0a0a0f`), amber/gold accents (`#d1a45a`, `#f0d6a5`), cyan links (`#00e5ff`)
- **Dead code removed**: ~478 lines of old pre-server-authoritative frontend movement code were cleaned up

### UI: CUSTOMIZE Modal

The Office view's **CUSTOMIZE** button (⚙️) opens a modal for editing the selected agent's configuration live:

- **Role title** — text input to change the agent's role label
- **Reports-to** — dropdown to reassign the agent's parent in the org hierarchy (or clear it)
- **Reset** — restores all config (display names, roles, hierarchy) to startup defaults

Changes are persisted to `pixdash.json` immediately via the config API and broadcast to all connected clients.

### UI: Staff View

The **Staff** tab shows an interactive org tree built with **React Flow** + **Dagre** layout:

- **Pan/zoom/fit** — mouse wheel to zoom, drag to pan, toolbar button to fit the tree
- **Inline editing** — click on an agent card to edit the display name directly
- **Live sync** — changes via API or CUSTOMIZE modal update the tree in real time via `configStore`

### Testing

- **Live QA scripts** in `scripts/` — HTTP-based integration tests against a running server
- **Playwright** is a root dev dependency — E2E tests can be added
- No unit test framework is currently configured

---

## 8. Development Workflow

### Running in Dev Mode

```bash
# Install dependencies
pnpm install

# Start frontend dev server (Vite HMR on port 5173)
pnpm dev

# Backend must be started separately:
cd packages/backend
pnpm dev
# Or: node --watch src/server.ts
```

The backend expects:
- `pixdash.json` in the project root (see `pixdash.example.json`)
- `assets/sprites/blocked.png` for collision grid generation
- OpenClaw Gateway running at `ws://127.0.0.1:18789` (or set `PIXDASH_GATEWAY_URL`)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PIXDASH_GATEWAY_URL` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL |
| `PIXDASH_GATEWAY_TOKEN` | — | Gateway auth token |
| `OPENCLAW_GATEWAY_TOKEN` | — | Alternative gateway token source |
| `PIXDASH_LOG_LEVEL` | `info` | Backend log level |
| `VITE_API_URL` | `/api/v1` | Frontend API base URL |
| `VITE_WS_URL` | auto-derived | Frontend WebSocket URL (derived from API URL if not set) |

### Hot Reload

- **Frontend:** Vite HMR — instant component updates
- **Backend:** Use `node --watch` or `tsx watch` for auto-restart on file changes

### Debug Logging

Frontend debug logging is available via `lib/debug.ts`:
```typescript
import { isDebug, isDebugAgent, debugAgent } from '@/lib/debug';
```

Set `window.__PIXDASH_DEBUG = true` in browser console to enable verbose logging including per-frame render logs and movement state tracking.

To debug a specific agent: `window.__PIXDASH_DEBUG_AGENT = 'agent:agent-two'`

### Build Process

```bash
# Build all packages
pnpm build

# Build frontend only
cd packages/frontend && pnpm build
# Output: packages/frontend/dist/

# Build backend only
cd packages/backend && pnpm build
```

### Deploy Process

#### Docker

```bash
docker compose up -d --build
```

The `Dockerfile` uses a multi-stage build:
1. **Builder stage**: `node:20-alpine` + `vips-dev` + `build-base` (for sharp compilation)
2. **Runtime stage**: `node:20-alpine` + `vips` (for collision grid generation)

`docker-compose.yml` uses `network_mode: host` so the container shares the host's network stack. Port defaults to `5555` via Docker Compose (vs `3000` for bare metal).

Volume mounts:
- `./assets` → `/app/assets:ro` — office layout + collision grid
- `./.env` → `/app/.env:ro` — environment variables
- `~/.openclaw/openclaw.json` → Gateway auth token
- `~/.openclaw/pixdash` → Device keys + appearances persistence

> **Important:** When running in Docker, `PIXDASH_GATEWAY_URL` in `.env` **must** use the host's LAN IP (e.g., `ws://192.168.1.200:18789`), **not** `localhost` or `127.0.0.1`.

#### start.sh

The `start.sh` script starts the production backend which serves both API and frontend static files from `packages/frontend/dist/`.

### Dual Deploy During Development

When developing, you typically need both the backend and frontend running:

```bash
# Terminal 1: backend (production build, serves API + static files)
cd packages/backend && node dist/server.js

# Terminal 2: frontend (Vite dev server with HMR)
pnpm dev  # starts Vite on port 5173
```

Vite proxies API requests to the backend. The backend serves `packages/frontend/dist/` in production, but during development the Vite dev server provides HMR.

Alternatively, use `start.sh` for a single-process production-like setup (no HMR).

### Production Architecture

In production, the Fastify server:
1. Serves REST API at `/api/v1/*`
2. Serves WebSocket at `/ws`
3. Serves frontend static files from `packages/frontend/dist/`
4. Falls back to `index.html` for SPA routing (404 handler)
