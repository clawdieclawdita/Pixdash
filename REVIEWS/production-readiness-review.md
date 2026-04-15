# PixDash Production Readiness Review

**Date:** 2026-04-15  
**Reviewer:** Production Readiness Engineer (automated)  
**Scope:** Full backend, frontend, Docker, deployment  
**Branch:** `dev` | **Repo:** `/home/pschivo/.openclaw/workspace-devo/pixdash/`

---

## Executive Summary

PixDash is a well-structured internal tool with solid fundamentals — proper A* pathfinding, backend-authoritative movement, JSON Schema validation, heartbeat-based WebSocket liveness, and a clean Docker setup. However, it has **several P0 security gaps** and **operational gaps** that must be addressed before any public-facing deployment. As an internal-only tool on a trusted network, some items are lower priority, but the security model assumes a safe network that may not exist.

---

## 1. Security Assessment

### 🔴 P0: No Authentication on API or WebSocket

**Files:** `packages/backend/src/server.ts`, `packages/backend/src/websocket/server.ts`, `packages/backend/src/routes/agents.ts`

- **All REST routes** (`/api/v1/agents`, `/api/v1/agents/:id/appearance`, `/api/v1/agents/:id/displayName`, `/api/v1/agents/:id/logs`, `/api/v1/office/layout`) are completely unauthenticated.
- **The WebSocket endpoint** (`/ws`) accepts any connection with zero auth.
- Anyone who can reach the port can: read all agent data, modify appearances, change display names, read agent logs (which contain activity summaries), and receive real-time agent events.
- The `PATCH /api/v1/agents/:id/appearance` and `PATCH /api/v1/agents/:id/displayName` routes are **write-enabled** with no auth.

**Impact:** On any accessible network, full read/write access to agent state.

### 🔴 P0: CORS Set to `origin: true` (Reflects Any Origin)

**File:** `packages/backend/src/server.ts`
```ts
await app.register(cors, { origin: true });
```

This reflects any `Origin` header back as `Access-Control-Allow-Origin`, meaning any website can make cross-origin requests to PixDash's API if it's reachable from the browser. Combined with no auth, this is a full data exfiltration vector.

### 🟡 P1: Gateway Token Read from Filesystem Without Error Hardening

**File:** `packages/backend/src/config/index.ts`

The gateway token is read from `openclaw.json` via a JSONC parser. The parser is reasonable, but:
- The fallback regex for token extraction (`packages/backend/src/config/index.ts:44`) could match unintended patterns in malformed configs.
- The `PIXDASH_GATEWAY_TOKEN` env var is not validated as a non-empty string.

### 🟡 P1: WebSocket Input Validation is Minimal

**File:** `packages/backend/src/websocket/handlers.ts`

The `handleWsRequest` function parses incoming WebSocket messages but:
- No schema validation on `WsRequestMessage` shape — just casts via `as WsRequestMessage`.
- No rate limiting on WebSocket messages — a client can flood `updateAppearance` or `moveAgent` calls.
- The `moveAgent` method passes `request.waypointId` and `request.destination` without deep validation of the destination object shape.

### 🟡 P1: No Rate Limiting on Any Endpoint

No `@fastify/rate-limit` or equivalent. A single client can hammer any endpoint.

### 🟢 P2: Sensitive Field Stripping is Good

**File:** `packages/backend/src/routes/agents.ts` — `stripSensitiveFields()` correctly removes `soul`, `identity`, and sensitive config fields (`workspace`, `agentDir`, `source`, `model`) from API responses. However, `GET /api/v1/agents/:id/logs` returns logs without stripping, and logs may contain tool call summaries with internal details.

### 🟢 P2: Device Key Security is Adequate

**File:** `packages/backend/src/services/GatewayClient.ts`

Ed25519 device keys are generated and stored with `chmod 0o600`. The key derivation matches OpenClaw Gateway's expected format. This is well done.

---

## 2. Reliability Assessment

### 🟡 P1: No Graceful Shutdown Signal Handling

**File:** `packages/backend/src/server.ts`

There's an `onClose` hook but no `SIGTERM`/`SIGINT` handler. When Docker sends `SIGTERM`, Fastify's default behavior will close the server, but:
- Active WebSocket connections are not explicitly closed with a close frame.
- The `onClose` hook runs, but there's no drain period for in-flight operations.
- Gateway reconnection will fire after shutdown since `stop()` is only called via `onClose`.

### 🟡 P1: Agent State is Fully Ephemeral

All agent state (positions, statuses, logs, tasks, movement paths) is in-memory only. On backend restart:
- All agents start at random spawn positions
- All logs and tasks are lost
- All movement state is lost
- Agents must be re-discovered via Gateway connection + config watcher

For a visualization tool this is acceptable, but should be documented as a known limitation.

### 🟢 P2: WebSocket Reconnection is Solid (Frontend)

**File:** `packages/frontend/src/hooks/useWebSocket.ts`

- Exponential backoff with 10s max delay
- Connect timeout (10s)
- Heartbeat send (15s) + stale detection (45s)
- Clean reconnect on disconnect with full state re-sync via HTTP
- Proper cleanup on unmount

This is well-implemented.

### 🟢 P2: Gateway Reconnection is Solid (Backend)

**File:** `packages/backend/src/services/GatewayClient.ts`

- Exponential backoff with 30s max
- Challenge-response authentication
- Automatic re-subscribe on reconnect
- Proper `manuallyStopped` flag to prevent reconnect loops

### 🟢 P2: Stuck Agent Recovery

**File:** `packages/backend/src/services/MovementEngine.ts`

- Detects agents stuck in `moving` with empty paths
- Blocked-path timeout (5s) with reroute attempts
- Periodic position validation and nearest-walkable snapping

---

## 3. Operational Readiness

### 🟡 P1: Health Check is Minimal

**File:** `packages/backend/src/routes/health.ts`
```ts
app.get('/api/v1/health', async () => ({ ok: true, service: 'pixdash-backend' }));
```

This only confirms the HTTP server is up. It does NOT check:
- Gateway WebSocket connection status
- Whether any agents are being tracked
- Whether the config watcher is alive
- Whether movement engine is ticking

A degraded state (Gateway disconnected, no agents visible) will still report `ok: true`.

### 🟡 P1: Logging Inconsistency

- `AgentStateManager.ts` and `MovementEngine.ts` use `console.warn` and `console.error` instead of the pino logger
- `GatewayClient.ts` uses pino correctly
- Mixed logging makes production log aggregation unreliable

### 🟡 P1: No Process-Level Error Handling

**File:** `packages/backend/src/server.ts`

No `process.on('uncaughtException')` or `process.on('unhandledRejection')` handlers. An unhandled promise rejection will crash the process with no logging.

### 🟢 P2: Docker Setup is Clean

- Multi-stage build with proper layer caching
- Health check with `wget` (Alpine has no `curl`)
- `network_mode: host` is intentional for Gateway loopback access
- `restart: unless-stopped` is appropriate
- Secrets mounted read-only from host

### 🟢 P2: Configuration is Well-Structured

- `.env.example` documents all variables
- Sensible defaults with env var overrides
- `ConfigWatcher` with file watching + JSONC parsing is robust

---

## 4. Performance Under Load

### 🟡 P1: A* Pathfinding Has No Cache

**File:** `packages/backend/src/services/PathfindingService.ts`

`findPath()` runs a full A* search on every request. With N agents each potentially rerouting every 3 seconds, this could become expensive on a large grid (75×56 = 4200 tiles). No path cache exists.

### 🟡 P1: `structuredClone` on Every Agent Read

**File:** `packages/backend/src/services/AgentStateManager.ts`

`getAgents()` calls `structuredClone` on every agent for every call. With 16+ agents and frequent WebSocket broadcasts, this creates significant GC pressure. The `AgentStateManager.getAgents()` is called by the HTTP endpoint AND indirectly by the sync WebSocket message.

### 🟡 P1: WebSocket Broadcast Sends Full State to Every Client

**File:** `packages/backend/src/websocket/server.ts`

`broadcast()` sends the full serialized payload to every connected client. With multiple browser tabs, each movement tick generates N×clients messages. No delta compression.

### 🟢 P2: Frontend Render Loop is Clean

**File:** `packages/frontend/src/hooks/useCanvas.ts`

Uses `requestAnimationFrame` with proper cleanup. The movement store uses a `smoothPositionTargets` Map bypassing Zustand for high-frequency updates — smart architecture.

### 🟢 P2: Movement Store Flush Throttling

**File:** `packages/frontend/src/hooks/useAgents.ts`

Zustand updates are throttled to ~8Hz via `bufferMovementUpdate`/`flushMovementBuffer`. Terminal states flush immediately. This is well-designed.

---

## 5. Missing Safeguards for Launch

| Safeguard | Status | Impact |
|-----------|--------|--------|
| Auth on API/WebSocket | ❌ Missing | P0: Full data exposure |
| CORS restriction | ❌ Missing | P0: Cross-origin exploitation |
| Rate limiting | ❌ Missing | P1: DoS / abuse |
| Input schema validation on WS | ❌ Partial | P1: Malformed payloads |
| Error boundaries (React) | ❌ Missing | P1: Unhandled render errors crash UI |
| Graceful shutdown | ❌ Partial | P1: Unclean disconnects |
| Process error handlers | ❌ Missing | P1: Silent crashes |
| Health check depth | ❌ Minimal | P1: False-positive healthy |
| Pathfinding cache | ❌ Missing | P1: CPU under load |

---

## 6. Launch Blockers vs Non-Blockers

### 🔴 P0 — MUST Fix Before Any Release (Even Internal)

1. **Add authentication** — at minimum, a shared secret/API key middleware on all routes and WebSocket connections. Even a simple `Authorization: Bearer <token>` header check.
2. **Restrict CORS** — set `origin` to the actual frontend URL(s), not `true`. For internal tools, restrict to `localhost`/LAN IPs.

### 🟡 P1 — Should Fix Before Public/External Access

3. **Add rate limiting** — `@fastify/rate-limit` on all endpoints, especially WebSocket message handlers.
4. **Schema-validate WebSocket input** — validate `WsRequestMessage` with AJV before processing.
5. **Improve health check** — include Gateway connection status, agent count, last event timestamp.
6. **Add process error handlers** — `uncaughtException` and `unhandledRejection` with logging and graceful shutdown.
7. **Unify logging** — replace `console.*` with pino logger in `AgentStateManager.ts` and `MovementEngine.ts`.
8. **Add React Error Boundaries** — wrap the app in an error boundary with a recovery UI.
9. **Pathfinding cache** — cache paths keyed by start+end coordinates; invalidate on grid changes.
10. **Reduce `structuredClone` overhead** — consider returning frozen/readonly views or using a pooling strategy.

### 🟢 P2 — Can Wait

11. **Agent state persistence** — persist logs/tasks to SQLite or file for post-restart recovery.
12. **Delta-based WebSocket updates** — only send changed fields instead of full state.
13. **WebSocket connection limit** — max concurrent connections.
14. **Metrics/observability** — expose `/metrics` endpoint with agent counts, message rates, etc.
15. **Graceful WebSocket drain** — send close frames to all clients before server shutdown.

---

## Summary

PixDash is architecturally sound — the backend-authoritative movement, A* pathfinding, config watcher, and Gateway integration are well-designed. The codebase is clean and TypeScript-strict. The main gaps are in **security hardening** (auth, CORS, rate limiting) and **operational resilience** (health checks, error handling, logging consistency).

For **internal use on a trusted LAN**, P0 items #1-2 can be deferred with documented risk acknowledgment. For **any public or semi-public deployment**, all P0 and P1 items should be addressed.
