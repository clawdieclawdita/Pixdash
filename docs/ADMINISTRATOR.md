# PixDash Administrator Guide

## 1. Architecture Overview

### System Diagram

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────────┐         ┌──────────┐
│   Browser    │◄──WS───►│  PixDash Backend  │◄──WS───►│  OpenClaw Gateway │◄──WS───►│  Agents  │
│  (Canvas UI) │◄──REST─►│  (Fastify + WS)   │         │   (Auth + PubSub) │         │(OpenClaw)│
└──────────────┘         └──────────────────┘         └──────────────────┘         └──────────┘
                                │    ▲
                                │    │
                         ┌──────┘    └──────┐
                         ▼                    ▼
                   ┌──────────┐       ┌──────────────┐
                   │ pixdash  │       │ appearances  │
                   │  .json   │       │   .json      │
                   └──────────┘       └──────────────┘
```

### Monorepo Structure

```
pixdash/
├── packages/
│   ├── shared/          # TypeScript types, constants, JSON schemas
│   ├── backend/         # Fastify HTTP/WebSocket server
│   │   └── src/
│   │       ├── server.ts              # Entry point, wiring
│   │       ├── config/                # Config loading (env vars + JSONC)
│   │       ├── routes/                # REST API (agents, health, office, config)
│   │       ├── services/              # Core business logic
│   │       │   ├── GatewayClient.ts   # WebSocket client to OpenClaw Gateway
│   │       │   ├── AgentStateManager.ts # Agent lifecycle + status
│   │       │   ├── MovementEngine.ts  # Movement routing + wander
│   │       │   ├── PathfindingService.ts # A* pathfinding
│   │       │   ├── AppearanceStore.ts # Persisted agent appearances
│   │       │   ├── ConfigWatcher.ts   # Live-reload from openclaw.json
│   │       │   └── CollisionGridLoader.ts # Walkability grid from blocked.png
│   │       ├── data/                  # Waypoints + no-go tile definitions
│   │       ├── websocket/             # WS server + request handlers
│   │       └── schemas/               # JSON schemas for validation
│   └── frontend/        # Vite + React app (Canvas rendering)
├── assets/
│   ├── office-layout.json             # Tilemap data
│   ├── collision-grid.json            # Pre-computed walkability grid
│   ├── blocked.png                    # Source for collision grid
│   └── palettes/                      # Color palettes (hair, skin, outfits)
├── pixdash.json                       # Agent configuration
├── docker-compose.yml
├── Dockerfile
├── start.sh / stop.sh
└── .env                               # Environment variables
```

### What Runs Where

| Component | Location | Technology |
|---|---|---|
| Canvas rendering | Browser (client) | HTML5 Canvas, React |
| Movement / pathfinding | Backend (server) | A* algorithm, 50ms tick loop |
| Agent state tracking | Backend (server) | Node.js EventEmitter |
| Auth to Gateway | Backend (server) | Ed25519 device keys |
| Frontend assets | Backend serves in production | `@fastify/static` |

### Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 (Alpine) |
| Package manager | pnpm | 10.17.1 |
| HTTP server | Fastify | (see package.json) |
| WebSocket | `@fastify/websocket` + `ws` | — |
| Frontend build | Vite | (see frontend package.json) |
| UI framework | React | — |
| Image processing | sharp | — |
| Config watcher | chokidar | — |
| CORS | `@fastify/cors` | — |
| Protocol | Gateway Protocol v3 | — |

---

## 2. Data Flow

### Agent Data: Gateway → Backend → Browser → Canvas

1. **OpenClaw Gateway** emits events (`agent.status`, `agent.log`, `agent.task`, `health`, `session.message`, `session.tool`) via WebSocket.
2. **GatewayClient** receives events and dispatches to **AgentStateManager**:
   - Status events → `applyStatusEvent()` → status derivation + broadcast
   - Log events → `applyLogEvent()` → log buffer (max 100) + broadcast
   - Task events → `applyTaskEvent()` → task buffer (max 200) + broadcast
   - Session messages → `recordActivity()` + `applyLogEvent()` for assistant/user messages
3. **AgentStateManager** broadcasts changes via EventEmitter.
4. **PixDashWebSocketServer** fans out events to all connected browser WebSocket clients.
5. **Frontend** receives events, updates Zustand stores, and the Canvas re-renders.

### Status Lifecycle

```
                    ┌─────────────────────────────────────────┐
                    │           Activity Detected             │
                    │   (session.message, session.tool, etc.) │
                    └─────────────┬───────────────────────────┘
                                  ▼
                             ┌─────────┐
               ┌────────────►│ working │◄─── grace period: 10s
               │             └────┬────┘
               │                  │ (no activity for 10s)
               │                  ▼
               │             ┌─────────┐
               │             │ online  │◄─── last session age < 5 min
               │             └────┬────┘
               │                  │ (no activity for 5 min)
               │                  ▼
    ┌──────────┴──┐        ┌─────────┐
    │   offline   │        │  idle   │───── wanders to random waypoints
    └─────────────┘        └─────────┘
        ▲                       ▲
        │                       │
   Gateway says              Gateway says
   "offline"                 "idle" / no data
```

Status derivation rules in `AgentStateManager.deriveStatus()`:
- **working**: activity detected within last 10s
- **online**: activity detected within last 5 min (but > 10s ago)
- **idle**: activity last seen > 5 min ago, or baseline from Gateway
- **offline**: explicit offline event from Gateway
- **busy**: passed through from Gateway (no automatic transition)

Agents offline for > 24 hours are automatically removed from memory.

### Movement Data Flow

```
Status change (working/online)
        │
        ▼
MovementEngine.handleStatusChange()
        │
        ├─ Find reserved waypoint → routeAgentToWaypoint()
        └─ Find nearest desk → routeToCategory('desk')
                │
                ▼
        PathfindingService.findPath()   ← A* on walkability grid
                │
                ▼
        MovementEngine.movementTick()   ← Every 50ms
        (advance along path at 5 tiles/sec)
                │
                ▼
        AgentStateManager.emitMovement()
                │
                ▼
        PixDashWebSocketServer.broadcast()
                │
                ▼
        Frontend receives agent:movement event
                │
                ▼
        Lerp interpolation on Canvas   ← smooth visual movement
                │
                ▼
        On arrival → mark "seated" or "idle"
                   → schedule next wander (idle: 60–90s random delay)
```

Movement features:
- **Waypoint claiming**: each waypoint can only be claimed by one agent
- **Occupied tile avoidance**: agents reroute around stationary agents
- **Blocked timeout**: cancels movement after 5s if no detour found
- **Stale path recovery**: auto-recovers from stuck-in-moving state
- **Position validation**: snaps agents to nearest walkable tile if corrupted

### Appearance Customization Flow

```
PATCH /api/v1/agents/:id/appearance   or   WS { method: "updateAppearance" }
        │
        ▼
AgentStateManager.upsertAppearance()
        │
        ▼
AppearanceStore.merge()   ← validates against JSON schema
        │
        ▼
Persisted to appearances.json
        │
        ▼
Broadcast agent:appearance event
        │
        ▼
Frontend updates agent appearance in Canvas
```

---

## 3. Agent Configuration (`pixdash.json`)

### Full Schema

```jsonc
{
  // Map of agent ID → display name shown in the UI
  "displayNames": {
    "<agentId>": "Human Name"
  },

  // Map of agent ID → role label for org chart
  "roles": {
    "<agentId>": "Role Title"
  },

  // Org hierarchy: array of parent → child edges
  "hierarchy": [
    { "parent": "<agentId>", "child": "<agentId>" }
  ],

  // Map of agent ID → reserved waypoint ID (assigned on spawn)
  "reservedWaypoints": {
    "<agentId>": "<waypointId>"
  },

  // Agent spawn positions on the tile grid [x, y]
  "spawnPositions": [
    { "x": 3, "y": 22 }
  ]
}
```

### Default Values

| Field | Default | Notes |
|---|---|---|
| `displayNames` | `{}` | Agents use Gateway-provided name |
| `roles` | `{}` | Agents default to `"Agent"` |
| `hierarchy` | `[]` | No hierarchy shown |
| `reservedWaypoints` | `{}` | No reserved seats |
| `spawnPositions` | 16 predefined positions | See `pixdashConfig.ts` for full list |

### Available Waypoint IDs

**Desks**: `desk-a1` through `desk-g4` (28 desk waypoints total)

**Reception**: `reception-front`, `reception-1` through `reception-7`

**Restrooms**: `rest-1` through `rest-8`

**Conference**: `conf-head-n`, `conf-head-s`, `conf-left-1` through `conf-left-5`, `conf-right-1` through `conf-right-5`

**Dining**: `dining-center`

### How to Add a New Agent

1. Add the agent to OpenClaw's `openclaw.json` under `agents.list`.
2. Edit `pixdash.json` to add the new agent's entries:

```jsonc
{
  "displayNames": {
    // ... existing entries ...
    "newagent": "New Agent"
  },
  "roles": {
    // ... existing entries ...
    "newagent": "Developer"
  },
  "hierarchy": [
    // ... existing edges ...
    { "parent": "devo", "child": "newagent" }
  },
  "reservedWaypoints": {
    // Optional: assign a specific desk
    "newagent": "desk-a3"
  }
}
```

3. The **ConfigWatcher** auto-reloads when `openclaw.json` changes — no restart needed for agent discovery.
4. `pixdash.json` changes require a restart (or config reload).

### How to Modify an Existing Agent

#### Via UI (recommended)

- **Display name**: Edit inline on the **Staff** view agent cards, or via the Office **CUSTOMIZE** modal.
- **Role**: Edit inline on the Office **CUSTOMIZE** modal (role title input).
- **Reports-to**: Edit via the Office **CUSTOMIZE** modal (reports-to dropdown).
- **Body type**: Via the **CUSTOMIZE** modal appearance editor. Available body types: `male`, `female`, `neutral`, `michael`, `angela`, `phillis`, `creed`, `ryan`, `pam`, `kelly`, `kate`, `pites`, `jim`, `clawdie`.
- **Reserved waypoint**: Update `reservedWaypoints.<agentId>` in `pixdash.json`, restart.

#### Via API

- **Display name**: `PATCH /api/v1/config/displayNames` — see [Config Management API](#config-management-api) below.
- **Role**: `PATCH /api/v1/config/roles` — see below.
- **Body type**: `PATCH /api/v1/agents/:id/appearance` with `{ "bodyType": "jim" }`.
- **Reserved waypoint**: Update `reservedWaypoints.<agentId>` in `pixdash.json`, restart.

#### Via pixdash.json (file edit)

- **Display name**: Update `displayNames.<agentId>`, restart.
- **Role**: Update `roles.<agentId>`, restart.
- **Reserved waypoint**: Update `reservedWaypoints.<agentId>`, restart.

### How to Change the Org Hierarchy

- **Via UI**: Use the Office **CUSTOMIZE** modal's reports-to dropdown — select a new parent or clear the field.
- **Via API**: `PATCH /api/v1/config/hierarchy` — see [Config Management API](#config-management-api) below.
- **Via file**: Edit the `hierarchy` array in `pixdash.json`. Each edge is `{ "parent": "<id>", "child": "<id>" }`. The tree is rendered from these edges — ensure no cycles.

### How to Reset Configuration

All changes made via the UI or API can be reverted to the original `pixdash.json` values:

- **Via UI**: Click the **Reset** button in the Office CUSTOMIZE modal.
- **Via API**: `POST /api/v1/config/reset` — see [Config Management API](#config-management-api) below.

The reset restores `displayNames`, `roles`, and `hierarchy` to the values loaded at startup.

### How to Configure Spawn Positions

Add or modify entries in `spawnPositions`. Each entry is `{ "x": <tileX>, "y": <tileY> }`. Positions must be on walkable tiles.

---

## 4. Deployment Options

### Local Development

```bash
cd pixdash
pnpm install
pnpm dev          # Starts Vite dev server for frontend only
```

For full backend + frontend:
```bash
pnpm build        # Build all packages
cd packages/backend
node dist/server.js
```

### Production via start.sh / stop.sh

```bash
# Start (builds all packages, runs backend, creates PID file)
./start.sh

# Stop (kills PID, falls back to process matching)
./stop.sh
```

**Environment variables** (set in `.env` or environment):

| Variable | Default | Description |
|---|---|---|
| `PIXDASH_HOST` | `192.168.1.200` | Bind address |
| `PIXDASH_PORT` | `3000` | HTTP port |
| `PIXDASH_DEV_MODE` | `false` | Set `true` to enable `--watch` + source maps |
| `PIXDASH_LOG_LEVEL` | `info` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

**PID file**: `~/.openclaw/pixdash/pixdash.pid`
**Log file**: `~/.openclaw/pixdash/pixdash.log`

### Docker Compose Deployment

```bash
docker compose up -d
```

The `docker-compose.yml` uses `network_mode: host` so the container shares the host's network stack (Gateway at `127.0.0.1:18789` is directly reachable).

**Volume mounts**:
- `./assets` → `/app/assets:ro` — office layout + collision grid
- `./.env` → `/app/.env:ro` — environment variables
- `~/.openclaw/openclaw.json` → Gateway auth token
- `~/.openclaw/pixdash` → Device keys + appearances persistence

**Docker-specific environment**:

| Variable | Default | Description |
|---|---|---|
| `PIXDASH_PORT` | `5555` | HTTP port inside container |
| `PIXDASH_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `PIXDASH_OPENCLAW_CONFIG` | `/root/.openclaw/openclaw.json` | Path to OpenClaw config |
| `PIXDASH_OFFICE_LAYOUT_PATH` | `/app/assets/office-layout.json` | Path to office layout |

### Port Configuration

Default ports: **3000** (bare metal), **5555** (Docker). Configurable via `PIXDASH_PORT`.

The backend serves:
- REST API at `/api/v1/*`
- WebSocket at `/ws`
- Frontend static files at `/` (in production, when `packages/frontend/dist` exists)

### Process Management

`start.sh` writes a PID to `~/.openclaw/pixdash/pixdash.pid`. `stop.sh` reads the PID and sends `SIGTERM`, with a fallback to `pkill -f "pixdash/packages/backend/dist/server.js"`.

---

## 5. Security

### Gateway Authentication

PixDash authenticates to the OpenClaw Gateway using **Ed25519 device keys**:

1. On first run, a key pair is generated and stored at `~/.openclaw/pixdash/device-key.json` (permissions `0600`).
2. The `deviceId` is derived as `SHA256(raw_Ed25519_public_key).hex`.
3. On connection, the Gateway sends a `connect.challenge` with a nonce.
4. PixDash signs `[v2, deviceId, gateway-client, backend, operator, scopes, timestamp, gatewayToken, nonce]` with the private key.
5. The Gateway validates the signature, issues a `deviceToken`, and grants `operator.read` + `operator.admin` scopes.

### Gateway Token Resolution

Token is resolved in order:
1. `OPENCLAW_GATEWAY_TOKEN` env var
2. `PIXDASH_GATEWAY_TOKEN` env var
3. `config.gatewayToken` (from `loadConfig()`)
4. `gateway.auth.token` from `~/.openclaw/openclaw.json`

### Sensitive Field Stripping

All API responses strip these fields from agent objects:
- `soul` — agent SOUL.md content
- `identity` — agent identity metadata
- `config.workspace`, `config.agentDir`, `config.source`, `config.model`

### WebSocket Error Sanitization

WebSocket error responses return generic `"Internal error"` messages. Full errors are logged server-side only.

### Local-Only Deployment

PixDash is designed for local network deployment. There are no exposed internet endpoints by default. CORS is set to `origin: true` (allow all origins for development convenience).

---

## 6. Maintenance

### Log Locations

| Source | Location |
|---|---|
| `start.sh` output | `~/.openclaw/pixdash/pixdash.log` |
| Backend process logs | stdout/stderr (captured by start.sh or Docker) |
| Docker logs | `docker compose logs pixdash` |

Log level is controlled by `PIXDASH_LOG_LEVEL` (default: `info`). Available levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.

### Health Check

```bash
curl http://localhost:3000/api/v1/health
# Response: {"ok":true,"service":"pixdash-backend"}
```

Docker healthcheck runs this every 30s with a 5s timeout.

### How to Restart

```bash
# Bare metal
./stop.sh && ./start.sh

# Docker
docker compose restart pixdash
```

### How to Update

```bash
git pull
pnpm install
./stop.sh
pnpm build
./start.sh

# Or Docker:
docker compose build --no-cache && docker compose up -d
```

### Backup Considerations

| File | Path | What it contains |
|---|---|---|
| Agent config | `pixdash.json` | Display names, roles, hierarchy, reserved waypoints |
| Appearances | `~/.openclaw/pixdash/appearances.json` | Custom agent appearances (body type, hair, outfit, etc.) |
| Device keys | `~/.openclaw/pixdash/device-key.json` | Ed25519 identity (loss = new device identity) |

### Monitoring the Gateway Connection

The `GatewayClient` uses exponential backoff reconnection (1s → 30s max). Check logs for:

- `"Connected to OpenClaw Gateway transport"` — transport open
- `"Gateway authentication succeeded"` — auth OK (includes protocol version, tick interval, scopes)
- `"Gateway socket closed"` — connection lost
- `"Scheduling Gateway reconnect"` — attempting reconnection
- `"Subscribing to agent session messages"` — subscribed to an agent's session

---

## 7. API Reference

### REST Endpoints

#### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Health check |

```bash
curl http://localhost:3000/api/v1/health
# {"ok":true,"service":"pixdash-backend"}
```

#### Agents

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/agents` | List all agents |
| GET | `/api/v1/agents/:id` | Get single agent |
| GET | `/api/v1/agents/:id/logs` | Get agent logs (paginated) |
| GET | `/api/v1/agents/:id/tasks` | Get agent tasks |
| PATCH | `/api/v1/agents/:id/appearance` | Update agent appearance |
| PATCH | `/api/v1/agents/:id/displayName` | Set agent display name |

**GET /api/v1/agents**

```bash
curl http://localhost:3000/api/v1/agents
```

Response:
```json
{
  "agents": [
    {
      "id": "main",
      "name": "Clawdie",
      "displayName": "Clawdie",
      "status": "online",
      "lastSeen": "2025-01-01T00:00:00.000Z",
      "position": { "x": 31, "y": 22, "direction": "south" },
      "appearance": { "bodyType": "clawdie", "hair": { "style": "short", "color": "#2C1810" }, "skinColor": "#E8BEAC", "outfit": { "type": "casual", "color": "#3B5998" }, "accessories": [] },
      "config": {},
      "stats": { "messagesProcessed": 0, "tasksCompleted": 0, "uptimeSeconds": 0 },
      "logs": [],
      "tasks": [],
      "movement": { "status": "idle", "claimedWaypointId": null, "destination": null, "path": [], "lastUpdatedAt": "...", "progress": 0 }
    }
  ]
}
```

**GET /api/v1/agents/:id**

```bash
curl http://localhost:3000/api/v1/agents/main
```

Returns a single agent object. 404 if not found.

**GET /api/v1/agents/:id/logs**

```bash
# Default: 100 most recent logs
curl http://localhost:3000/api/v1/agents/main/logs

# Paginated
curl "http://localhost:3000/api/v1/agents/main/logs?limit=20&offset=0&level=info"
```

Query params: `limit` (number), `offset` (number), `level` (`debug`, `info`, `warn`, `error`)

Response:
```json
{
  "logs": [
    { "id": "...", "timestamp": "...", "level": "info", "message": "💬 Hello world" }
  ],
  "total": 42,
  "hasMore": true
}
```

**GET /api/v1/agents/:id/tasks**

```bash
curl http://localhost:3000/api/v1/agents/main/tasks
```

Response:
```json
{
  "tasks": [
    { "id": "...", "type": "...", "status": "completed", "createdAt": "...", "updatedAt": "...", "description": "..." }
  ]
}
```

**PATCH /api/v1/agents/:id/appearance**

```bash
curl -X PATCH http://localhost:3000/api/v1/agents/main/appearance \
  -H "Content-Type: application/json" \
  -d '{"bodyType":"jim","hair":{"style":"spiky","color":"#E6CEA8"},"outfit":{"type":"formal","color":"#2ECC71"}}'
```

Response:
```json
{ "success": true, "appearance": { "bodyType": "jim", "hair": { "style": "spiky", "color": "#E6CEA8" }, "skinColor": "#E8BEAC", "outfit": { "type": "formal", "color": "#2ECC71" }, "accessories": [] } }
```

**PATCH /api/v1/agents/:id/displayName**

```bash
curl -X PATCH http://localhost:3000/api/v1/agents/main/displayName \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Clawdie Boss"}'
```

Response:
```json
{ "success": true, "displayName": "Clawdie Boss" }
```

Set to `null` to clear and revert to config-based display name.

#### Office

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/office/layout` | Get office tilemap layout |

```bash
curl http://localhost:3000/api/v1/office/layout
```

Returns the full `Tilemap` object (width, height, tileSize, layers, walkable grid).

#### Config

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/config` | Get public configuration |
| PATCH | `/api/v1/config/displayNames` | Update agent display name (persisted to `pixdash.json`) |
| PATCH | `/api/v1/config/roles` | Update agent role (persisted to `pixdash.json`) |
| PATCH | `/api/v1/config/hierarchy` | Reassign agent's parent in hierarchy (persisted to `pixdash.json`) |
| POST | `/api/v1/config/reset` | Reset all config to startup defaults |

```bash
curl http://localhost:3000/api/v1/config
```

Response:
```json
{
  "displayNames": { "main": "Clawdie" },
  "roles": { "main": "CEO" },
  "hierarchy": [{ "parent": "main", "child": "devo" }]
}
```

Note: `reservedWaypoints` and `spawnPositions` are **not** exposed in this endpoint.

#### Config Management API {#config-management-api}

All config mutations are persisted to `pixdash.json` on disk and broadcast to connected clients via the `agent:config` WebSocket event.

**PATCH `/api/v1/config/displayNames`** — Set an agent's display name:

```bash
curl -X PATCH http://localhost:3000/api/v1/config/displayNames \
  -H "Content-Type: application/json" \
  -d '{"agentId":"main","displayName":"Clawdie Boss"}'
```

Response: `{"success":true,"displayNames":{"main":"Clawdie Boss",...}}`

**PATCH `/api/v1/config/roles`** — Set an agent's role title:

```bash
curl -X PATCH http://localhost:3000/api/v1/config/roles \
  -H "Content-Type: application/json" \
  -d '{"agentId":"main","role":"CTO"}'
```

Response: `{"success":true,"roles":{"main":"CTO",...}}`

**PATCH `/api/v1/config/hierarchy`** — Reassign an agent's parent:

```bash
# Move 'forbidden' to report to 'cornelio'
curl -X PATCH http://localhost:3000/api/v1/config/hierarchy \
  -H "Content-Type: application/json" \
  -d '{"child":"forbidden","newParent":"cornelio"}'

# Remove from hierarchy entirely
curl -X PATCH http://localhost:3000/api/v1/config/hierarchy \
  -H "Content-Type: application/json" \
  -d '{"child":"forbidden","newParent":null}'
```

Response: `{"success":true,"hierarchy":[...]}`

Circular dependencies and self-parenting return `400`.

**POST `/api/v1/config/reset`** — Restore startup defaults:

```bash
curl -X POST http://localhost:3000/api/v1/config/reset
```

Response: `{"success":true,"displayNames":{...},"roles":{...},"hierarchy":{...}}`

Restores `displayNames`, `roles`, and `hierarchy` to the values loaded from `pixdash.json` at server startup.

#### UI: CUSTOMIZE Modal

The Office view's **CUSTOMIZE** button (⚙️) opens a modal for editing the selected agent's configuration without restarting the server:

- **Role title** — text input to change the agent's role label
- **Reports-to** — dropdown to reassign the agent's parent in the org hierarchy (or clear it)
- **Reset** — restores all config (display names, roles, hierarchy) to startup defaults

Changes are persisted to `pixdash.json` immediately and reflected across all connected clients.

#### UI: Staff View

The **Staff** tab shows an interactive org tree built with React Flow + Dagre layout:

- **Pan/zoom/fit** — mouse wheel to zoom, drag to pan, toolbar button to fit the tree
- **Inline editing** — click on an agent card to edit the display name directly
- **Live sync** — changes via API or CUSTOMIZE modal update the tree in real time

### WebSocket Endpoint

**Connect**: `ws://localhost:3000/ws`

On connection, server sends:
```json
{ "type": "connected", "clientId": "uuid", "serverVersion": "1.0.0" }
```

#### WebSocket Requests

| Method | Description | Params |
|---|---|---|
| `sync` | Get full state snapshot (all agents + office layout) | — |
| `updateAppearance` | Update agent appearance | `{ agentId, appearance: AppearancePatch }` |
| `moveAgent` | Move agent to waypoint or coordinates | `MoveAgentRequest` |

```json
// Request
{ "type": "req", "id": "1", "method": "sync" }
{ "type": "req", "id": "2", "method": "updateAppearance", "params": { "agentId": "main", "appearance": { "bodyType": "pam" } } }
{ "type": "req", "id": "3", "method": "moveAgent", "params": { "agentId": "main", "waypointId": "desk-a1" } }

// Response
{ "type": "res", "id": "1", "ok": true, "payload": { "agents": [...], "officeLayout": {...} } }
{ "type": "res", "id": "2", "ok": true, "payload": { "appearance": {...} } }
{ "type": "res", "id": "3", "ok": true, "payload": { "ok": true, "agent": {...} } }
```

#### WebSocket Broadcast Events

The server pushes these events to all connected clients:

| Event | Payload | Description |
|---|---|---|
| `agent:status` | `{ agentId, status, timestamp }` | Agent status changed |
| `agent:log` | `{ agentId, log }` | New log entry |
| `agent:task` | `{ agentId, task }` | Task created or updated |
| `agent:appearance` | `{ agentId, appearance }` | Appearance modified |
| `agent:position` | `{ agentId, position, direction }` | Position update |
| `agent:movement` | `{ agentId, movement, position }` | Movement tick (path, progress, fractional position) |
| `agent:config` | `{ agentId, agent }` | Config/identity updated |
| `agent:conference` | `{ agentIds, sessionKey, source, timestamp }` | Agents in conference |

```json
{ "type": "event", "event": "agent:status", "payload": { "agentId": "main", "status": "working", "timestamp": "..." } }
{ "type": "event", "event": "agent:movement", "payload": { "agentId": "main", "movement": { "status": "moving", "path": [...], "progress": 0.5, "fractionalX": 1008, "fractionalY": 720 }, "position": { "x": 31, "y": 22, "direction": "east" } } }
```
