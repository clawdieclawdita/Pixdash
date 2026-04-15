# PixDash v1.0 — Consolidated Product Roadmap

**Date:** 2026-04-15  
**Branch:** `dev`  
**Based on:** Product Strategist + Frontend/UX Architect + Production Readiness Engineer reviews

---

## Executive Summary

PixDash has **exceptionally strong engineering foundations** — backend-authoritative movement, real Gateway auth (Ed25519 challenge-response), A* pathfinding, smooth 20Hz interpolated rendering, ReactFlow org chart, Docker support. The core visualization loop works well.

**Two fundamental problems block a credible v1.0:**

1. **Hardcoded agents** — The entire app is wired to 6 specific agent IDs, display names, roles, org hierarchy, and spawn positions. PixDash only works for one OpenClaw setup. This should never have shipped this way.
2. **Zero API authentication** — Fastify server + WebSocket endpoint are wide open. Any network-reachable client gets full read/write access to agent data, logs, appearance changes.

Beyond those, there is ~1,100 lines of dead frontend code, debug overlays shipped to production, no onboarding, no mobile support, and significant UX gaps.

---

## P0 — Ship Blockers (Must Fix Before Any Release)

### P0-1: Dynamic Agent Discovery
**Effort: Medium** | **Owner: Backend + Frontend**

Remove ALL hardcoded agent data. PixDash must work with any OpenClaw Gateway configuration.

**What's hardcoded now:**
- `AgentStateManager.ts` — display names, spawn positions, body type defaults
- `StaffView.tsx` — `ROLE_MAP` (6 entries), `ORG_EDGES` (5 hardcoded edges), `visibleAgents` filter
- `AgentNodeCard.tsx` — role labels derived from `ROLE_MAP`
- Backend `waypoints.ts` — reserved seat `reception-clawdie` for agent `main`
- `movementStore.ts` (frontend) / `MovementEngine.ts` (backend) — home-base routing for `main`

**Required changes:**
- Derive agent roster entirely from Gateway `agents.list` + config data
- Display names: read from agent config, fall back to agent ID
- Roles: configurable via `pixdash.json` or OpenClaw agent metadata
- Org hierarchy: user-configurable via settings file (not hardcoded)
- Spawn positions: random walkable tiles (already have collision grid)
- Body type defaults: random selection (already partially implemented)
- Reserved seats: configurable, not hardcoded per agent

**Files:** `AgentStateManager.ts`, `StaffView.tsx`, `AgentNodeCard.tsx`, `MovementEngine.ts`, `waypoints.ts`, new config schema

### P0-2: API + WebSocket Authentication
**Effort: Small** | **Owner: Backend**

**Current state:** Zero auth on all REST routes and WebSocket. CORS `origin: true`.

**Required:**
- Shared secret via `PIXDASH_API_TOKEN` env var (or `pixdash.json`)
- `Authorization: Bearer <token>` middleware on all REST routes
- Token validation on WebSocket upgrade
- Restrict CORS to configured origins (default: same-origin + localhost)
- Rate limiting via `@fastify/rate-limit`

**Files:** `server.ts`, `websocket/server.ts`, `config/index.ts`, new `auth.ts` middleware

### P0-3: Dead Code Cleanup
**Effort: Small** | **Owner: Frontend**

~1,100 lines of dead code from the server-authoritative migration.

**Delete entirely:**
- `lib/sprite-generator.ts` (~300 lines, zero consumers)
- `lib/pathfinding.ts` (~80 lines, unused client-side)
- `lib/collisionMap.ts` (~120 lines, collision grid not needed client-side)
- `lib/tilemap-loader.ts` (~40 lines, unused)
- `components/canvas/TilemapRenderer.ts` + `.tsx` (~150 lines, never instantiated)
- `store/movementStore.ts` (all methods are no-ops or redundant)

**Gut to essentials:**
- `lib/waypoints.ts` — keep only type definitions, remove coordinate data/no-go/claiming (~300 lines → ~30)
- `lib/movement.ts` — keep only `getWalkFrameIndex()`, `getArrivalStateForMovementType()`, coordinate helpers (~60 lines → ~20)

**Risk:** Zero. Nothing references these.

### P0-4: Onboarding / Empty State
**Effort: Small** | **Owner: Frontend**

**Current state:** New users see an empty office with a single "Controls" hint line.

**Required:**
- Welcome overlay explaining what PixDash is and what it needs (Gateway connection)
- When no agents are connected: actionable message with config guidance
- When Gateway is unreachable: visible status banner with reconnect suggestion
- Link to setup documentation

### P0-5: Hide Debug Overlays from End Users
**Effort: Tiny** | **Owner: Frontend**

The Click coordinate panel and Camera info panel are always visible. Gate behind a query parameter (`?debug=1`) or keyboard shortcut.

---

## P1 — Should Have Before Public Release

### P1-1: Remove Debug Infrastructure from Production
**Effort: Small** | **Owner: Frontend**

- Remove `isDebug()` / `isDebugAgent()` gating and all enclosed logging (~30% of `AgentRenderer.ts`)
- Remove `(window as any).__renderLogT` global mutations
- Remove `debugAgent` function and all call sites
- Strip `console.warn` from production hot paths (`useAgents.ts`, `movementStore.ts`)

### P1-2: Graceful Error Recovery
**Effort: Small** | **Owner: Backend + Frontend**

**Backend:**
- `process.on('uncaughtException')` and `unhandledRejection` handlers with logging
- Proper `SIGTERM`/`SIGINT` handlers with WebSocket drain + Gateway disconnect
- Unify logging: replace all `console.*` with pino in `AgentStateManager.ts` and `MovementEngine.ts`

**Frontend:**
- React Error Boundary wrapping the app with recovery UI
- Manual reconnect button when Gateway is disconnected
- Visible connection status banner (not just a tiny dot)

### P1-3: Improve Health Check
**Effort: Tiny** | **Owner: Backend**

Current `/api/v1/health` only confirms HTTP server is up. Include:
- Gateway WebSocket connection status
- Number of tracked agents
- Last event timestamp
- Movement engine status

### P1-4: Connected Views (Staff ↔ Office)
**Effort: Small** | **Owner: Frontend**

- Click agent node in Staff view → switch to Office view + pan camera to agent
- Click agent in Office → highlight corresponding node in Staff view
- These views feel completely disconnected today

### P1-5: Responsive Layout
**Effort: Medium** | **Owner: Frontend**

**Current state:** Desktop-only (`xl:grid-cols-[1fr_320px]`). No mobile touch gestures.

**Required:**
- Sidebar collapses to drawer on tablet
- Full-width canvas on mobile
- Touch pinch-to-zoom on canvas
- Minimum viable mobile experience (not perfect, but usable)

### P1-6: Log Pagination
**Effort: Small** | **Owner: Frontend**

Backend caps at 100 entries. `LogViewer` ignores offset/limit params. Add "Load more" button and scrolling pagination.

### P1-7: A* Pathfinding Cache
**Effort: Small** | **Owner: Backend**

`findPath()` runs full A* on every request with no cache. Cache paths keyed by start+end tile coordinates. Invalidate on grid changes.

### P1-8: Fix Performance Hotspots
**Effort: Small** | **Owner: Frontend**

- Replace glow `toDataURL()` cache key with `{templateName}:{frameIndex}`
- Lazy-load `useAllSpritePreviews` only when customizer opens
- Add Zustand selectors to `AgentPanel` (currently re-renders on every agent change)
- Debounce Staff view dagre layout (currently rebuilds on every status change)

### P1-9: WebSocket Input Validation
**Effort: Small** | **Owner: Backend**

Schema-validate incoming WebSocket messages with AJV before processing. Currently casts `as WsRequestMessage` without validation.

### P1-10: Full Character Customizer
**Effort: Medium** | **Owner: Frontend**

The `Appearance` type supports `hair.style`, `hair.color`, `skinColor`, `outfit.type`, `outfit.color`, `accessories` — but the UI only exposes body type presets. Build out the full editor.

---

## P2 — Nice to Have (After v1.0)

### Features
- **Activity feed / timeline** — Unified real-time feed of agent activity across the office
- **Agent stats dashboard** — Surface `messagesProcessed`, `tasksCompleted`, `uptimeSeconds` (already tracked, not displayed)
- **Day-night lighting cycle** — Subtle time-of-day overlay on office background
- **Sound effects** — Typing sounds for working agents, footstep sounds, notification chimes
- **Keyboard shortcuts** — Escape to close panel, Space to pause, arrow keys to pan
- **Mini-map** — Small overview with agent position dots
- **Agent speech bubbles** — Floating truncated recent messages above working agents
- **Search/filter agents** — Roster search, status filter (All/Online/Working/Idle/Offline)
- **Agent follow mode** — Camera tracks a selected agent
- **Custom office layouts** — Upload custom office PNG + collision grid

### UX Polish
- URL routing (`#/office`, `#/staff`, `#/agent/:id`) for bookmarkable views
- Smooth transitions between Office ↔ Staff views
- Loading skeletons matching pixel-art aesthetic
- Relative timestamps ("2 minutes ago") alongside absolute
- Agent count badge on Staff view tab
- Favicon and `<title>` with live agent count
- 404/error pages in pixel-art style
- Open Graph meta tags

### Accessibility
- ARIA landmarks on main regions
- Keyboard navigation for agent roster
- Focus management for modal/panel open/close
- Canvas ARIA description
- `prefers-reduced-motion` support
- Color-blind-safe status indicators

### Performance
- `structuredClone` reduction (frozen/readonly views or pooling)
- Delta-based WebSocket updates (only changed fields)
- WebSocket connection limit
- Metrics endpoint (`/metrics`)

### Technical
- Agent state persistence (logs/tasks to SQLite for post-restart recovery)
- Delta compression on WebSocket broadcasts
- Staff view `React.memo` on `AgentNodeCard`

---

## Recommended Execution Order

### Sprint 1: Foundation (P0)
| # | Task | Effort | Parallel? |
|---|------|--------|----------|
| P0-1 | Dynamic agent discovery | Medium | Can start immediately |
| P0-2 | API + WebSocket auth | Small | Parallel with P0-1 |
| P0-3 | Dead code cleanup | Small | Parallel, but after P0-1 to avoid conflicts |
| P0-4 | Onboarding / empty state | Small | Parallel |
| P0-5 | Hide debug overlays | Tiny | Parallel |

**Deliverable:** PixDash works with any OpenClaw setup, has basic security, clean codebase.

### Sprint 2: Hardening (P1 core)
| # | Task | Effort |
|---|------|--------|
| P1-1 | Remove debug infrastructure | Small |
| P1-2 | Error recovery (process handlers, React boundary, reconnect) | Small |
| P1-3 | Deep health check | Tiny |
| P1-7 | A* pathfinding cache | Small |
| P1-9 | WebSocket input validation | Small |

**Deliverable:** Production-safe error handling, proper observability.

### Sprint 3: UX Completeness (P1 frontend)
| # | Task | Effort |
|---|------|--------|
| P1-4 | Connected views (Staff ↔ Office) | Small |
| P1-5 | Responsive layout | Medium |
| P1-6 | Log pagination | Small |
| P1-8 | Performance hotspots | Small |
| P1-10 | Full character customizer | Medium |

**Deliverable:** Feels like a finished product, not a demo.

### Sprint 4+: P2 Features
Pick from the P2 list based on user feedback and usage patterns.

---

## What's Already Strong

These should NOT be touched — they work well:
- Backend-authoritative movement architecture
- Ed25519 Gateway authentication
- A* pathfinding with collision avoidance + rerouting
- 50ms tick / 20Hz broadcast smooth movement
- Dual-pipeline rendering (Zustand at 8Hz + direct Map at 60fps)
- WebSocket reconnection (both sides, exponential backoff)
- Stuck agent recovery
- Docker setup (multi-stage, host networking, health check)
- Device key security (chmod 0600)
- Sensitive field stripping on API responses
- Config watcher with JSONC parsing
- Character customizer foundation (11 body types, sprite caching)

---

## Bottom Line

The engineering is genuinely impressive. The two things that make this "cool internal tool" instead of "releasable product" are:

1. **Hardcoded agents** — Fix this and PixDash becomes useful to anyone running OpenClaw
2. **No API auth** — Fix this and PixDash becomes safe to deploy

Everything after that is quality and polish. The bones are excellent.
