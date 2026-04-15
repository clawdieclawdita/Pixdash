# PixDash Product Strategy Review

**Reviewer:** Product Strategist (subagent)  
**Date:** 2026-04-15  
**Branch:** dev  
**Codebase depth:** Full — backend, frontend, shared types, assets

---

## 1. What PixDash Already Has

### Core Infrastructure (solid)
- **Backend-authoritative architecture** — The backend (`AgentStateManager`, `MovementEngine`, `PathfindingService`) owns all agent state, movement, and pathfinding. The frontend is a pure renderer. This is the right call and well-executed.
- **Real Gateway integration** — `GatewayClient.ts` (350+ lines) does proper device-key auth, challenge-response signing, session subscription, and handles all Gateway event types (`agent.status`, `agent.log`, `agent.task`, `session.message`, `session.tool`, `health`). This is production-grade, not a toy mock.
- **A* pathfinding with collision avoidance** — 4-directional grid pathfinding with no-go tiles, waypoint claims, and dynamic rerouting around blocked agents. Includes blocked-timeout recovery and stale-path guards.
- **Smooth movement** — 50ms tick interpolation on the backend, `fractionalX`/`fractionalY` broadcast at 20Hz, bypass-Zustand smooth map on the frontend for buttery rendering.
- **Movement throttling** — Frontend buffers movement updates and flushes at ~8Hz for Zustand, while smooth position map reads at frame rate. Smart dual-pipeline design.

### Agent Visualization (complete)
- **11 character body types** — michael, angela, phillis, creed, ryan, pam, kelly, kate, pites, jim, clawdie. Each with 4-directional sprite sheets.
- **Canvas renderer with proper z-sorting** — Agents sorted by Y position for correct depth overlap.
- **Selected agent glow effect** — Pulsing white outline rendered via pre-computed edge detection on sprite data.
- **Agent name labels** — Pixel-font labels with background pill, zoom-aware opacity.
- **Shadow rendering** — Elliptical shadow beneath each sprite.
- **Seated visual offsets** — Agents shift onto chairs when seated at desks/conference/restrooms.

### Office View (functional)
- **Single pre-rendered office background** (`assets/sprites/office.png`) — A complete SNES-style pixel office with desks, conference rooms, restrooms, dining area, reception.
- **Camera controller** — Pan (drag), zoom (scroll), center-on-map (Fit button). DPI-aware canvas sizing.
- **Click-to-select agents** — Hit detection via sprite bounding boxes with z-ordering.
- **Debug overlays** — Pixel/tile coordinates, camera state, selected agent indicator (toggleable via debug flags).

### Staff View (functional)
- **ReactFlow org chart** — dagre auto-layout with predefined hierarchy edges (Clawdie→Devo→InfraLover→Forbidden, Clawdie→Cornelio, Devo→DocClaw).
- **Agent node cards** — Show sprite preview, status, role label.
- **Live status updates** — Node data updates without repositioning.
- **Fit-to-view** — Manual and auto-fit on mount.

### Agent Panel (well-built)
- **4 tabs** — Status (ID, position, display name editor), Config, Logs, Tasks.
- **Live agent data** — Merges WebSocket-updated status with fetched REST details.
- **Display name editing** — Per-agent rename with blur/enter save and clear button.
- **Character customizer** — Modal with 11 body-type presets, live 4-directional preview with walk animation.

### Backend Services (production-quality)
- **AppearanceStore** — Persistent per-agent appearance with JSON file storage.
- **ConfigWatcher** — File-system watcher for hot-reloading agent configuration.
- **Health endpoint** — `/api/v1/health` for monitoring.
- **Sensitive field stripping** — `soul`, `identity`, `workspace`, `agentDir`, `source`, `model` are stripped from all API responses. Good security hygiene.

### WebSocket Layer (robust)
- **Reconnect with exponential backoff** — Up to 10s cap on both backend Gateway client and frontend browser socket.
- **Heartbeat** — 15s ping interval, 45s stale detection.
- **Connect timeout** — 10s abort on initial connection.

---

## 2. What Is Weak or Incomplete

### The Hardcoded Agent Problem
The entire Staff view (`StaffView.tsx`) has hardcoded agent IDs and roles:
```ts
const ROLE_MAP: Record<string, string> = {
  main: 'CEO', devo: 'CDO', cornelio: 'CISO', infralover: 'IM', docclaw: 'DM', forbidden: 'Analyst',
};
const ORG_EDGES = [
  { id: 'main-devo', source: 'main', target: 'devo' },
  ...
] as const;
```
And `AgentStateManager.ts` has hardcoded display names and spawn positions. This means PixDash only works with this specific set of 6 agents. Anyone with a different OpenClaw setup sees a broken Staff view and agents spawning at arbitrary positions. **This is the single biggest problem for a public release.**

### No Authentication on the PixDash Backend
The Fastify server has zero auth. Any network client can hit `/api/v1/agents` and read all agent data, logs, tasks, configs. In a Docker deployment on a LAN, this is wide open. The Gateway connection is authenticated, but the PixDash HTTP/WS API itself is not.

### Customizer Is Shallow
The customizer only lets you pick a body type from 11 presets. The `Appearance` type supports `hair.style`, `hair.color`, `skinColor`, `outfit.type`, `outfit.color`, and `accessories` — but none of these are exposed in the UI. The customizer modal has code for hair/outfit/accessory but the actual controls are missing. It's a preset picker, not a character editor.

### Staff View Shows Only Known Agents
`visibleAgents` filters to `ROLE_MAP` keys only. Agents not in the hardcoded list are invisible in the Staff view. Combined with the hardcoded edges, this view is non-functional for any other OpenClaw deployment.

### Frontend Still Has Dead Code
`movementStore.ts` has three methods that are pure no-ops with `console.warn` messages: `placeAgentsOnLoad`, `handleStatusChange`, `handleConference`. They were stubbed during the "server-authoritative migration" but never cleaned up. The `collisionMap` is still loaded but unused. This is confusing for anyone reading the code.

### Logs Are Ephemeral and Shallow
The backend caps logs at 100 per agent (`agent.logs = logs.slice(0, 100)`). Session messages are truncated to 200 chars. There's no pagination on WebSocket-delivered logs — the panel does a REST fetch for logs but the log viewer in the panel doesn't support pagination either (`getAgentLogs` accepts offset/limit but the `LogViewer` component ignores them).

### No Error Recovery UI
When the Gateway is unreachable, agents slowly go offline one by one. There's no "reconnect" button, no status banner explaining what's happening, and no way to force a Gateway reconnect from the UI. The connection indicator just says "Disconnected" in tiny text.

### Debug Mode Left in Production Code
`AgentRenderer.ts` has extensive debug logging gated behind `isDebug()` / `isDebugAgent()` checks. While these are runtime toggles, the debug code itself (~30% of the file) is shipped to production. This adds maintenance burden and attack surface for information disclosure.

### No Mobile Support
The office canvas uses pointer events but the layout is a desktop grid (`xl:grid-cols-[1fr_320px]`). On mobile, the sidebar stacks below a 70vh canvas that's too small to interact with meaningfully. No touch-specific gestures (pinch zoom, two-finger pan).

---

## 3. What Features Should Be Added

### High Impact

1. **Dynamic Agent Discovery** — Remove all hardcoded agent IDs, display names, roles, and org edges. Derive everything from the Gateway's `agents.list` response and agent config data. The Staff view should build its hierarchy dynamically or allow the user to define it.

2. **PixDash API Authentication** — Add token-based auth (at minimum, a configurable shared secret). This is a network-facing service that exposes agent logs, tasks, and config data.

3. **Full Character Customizer** — Expose all `Appearance` fields: hair style/color picker, skin tone picker, outfit type/color, accessory toggles. The type system already supports it; the UI just needs to be built.

4. **Activity Feed / Timeline** — A unified real-time feed showing what agents are doing across the office. Currently, agent activity is buried in per-agent log tabs. A global "what's happening now" view would make the office feel alive.

5. **Agent Health / Uptime Dashboard** — The `stats` type tracks `messagesProcessed`, `tasksCompleted`, `uptimeSeconds` but none of this is surfaced. Show aggregate stats: most active agent, total tasks, uptime rankings.

### Medium Impact

6. **Office Time / Day-Night Cycle** — A subtle time-of-day lighting overlay on the office background. Agents active at 3AM create a different mood than daytime activity. Cheap to implement, high charm value.

7. **Sound Effects** — Optional. Typing sounds when agents are "working," footstep sounds when moving, notification chimes for status changes. Low effort, high atmosphere.

8. **Agent Grouping / Team Views** — Allow users to group agents by project, team, or custom tag. The current 6-agent hierarchy doesn't scale.

9. **Exportable Activity Reports** — CSV/JSON export of agent logs and activity summaries. Useful for actual monitoring use cases.

10. **Keyboard Shortcuts** — Space to pause/resume animation, arrow keys to pan, +/- to zoom, 1-6 to select agents. Power-user feature.

### Lower Impact

11. **Mini-map** — A small overview of the full office with dots for agent positions. Click to navigate.

12. **Agent Speech Bubbles** — Show truncated recent messages as floating speech bubbles above working agents. Makes the office feel like a living simulation.

13. **Custom Office Layouts** — Allow users to upload their own office PNG and collision grid. The infrastructure (tilemap loading, waypoint system) already supports this — just needs a UI.

---

## 4. What Should Be Improved Before Launch

### UX Issues

- **Panel can't be toggled independently** — The sidebar is either "scene info + roster" or "agent panel." There's no way to see the roster while inspecting an agent. Split these concerns.
- **No empty-state guidance** — When no agents are connected, a small dashed-border message appears but doesn't explain *why* or *how to fix it*. Should link to config docs.
- **Log timestamps not relative** — Show "2 minutes ago" alongside the absolute timestamp for recent activity.
- **No loading skeleton** — The "Loading live agent data…" overlay is a plain text box. Should have the pixel-art aesthetic.

### Product Flow Gaps

- **No onboarding** — First-time users see an empty office with no explanation. A brief setup guide or tooltip overlay explaining the Gateway connection requirement is essential.
- **Config is scattered** — `.env` for Gateway URL, filesystem for appearances, hardcoded for agent roster. A settings page in the UI would unify this.
- **Staff view and Office view feel disconnected** — Clicking an agent in Staff view doesn't navigate to their position in Office view. These should be linked.

### Consistency Issues

- **Two different connection status patterns** — The header shows connection state with a colored dot + label. The Staff view shows its own "X/Y online" counter. These should share a single source of truth and visual language.
- **Mixed panel styling** — The agent panel uses `pixel-inset` cards, the Staff view uses ReactFlow defaults with custom overrides, the customizer uses yet another card style. Unify the design system.

### Performance Concerns

- **Sprite glow pre-computation** — `getGlowCanvases()` iterates every pixel of every sprite to compute edge detection. The cache key uses `toDataURL().slice(-32)` which involves a full PNG encode. This should be done once at load time with a proper cache key (template name + frame index).
- **Movement engine runs even with zero agents** — The 50ms interval ticks unconditionally. Should be paused when no agents exist.
- **Full agent list cloned every `getAgents()` call** — `structuredClone` on all agents including their logs/tasks arrays for every API request. For 100+ log entries per agent, this is expensive.

### Technical Debt

- **Dead movement code** — Remove the stubbed `movementStore` methods, unused `collisionMap` loading, and fallback placement logic. Ship clean code.
- **TypeScript `any` types** — `bufferMovementUpdate` takes `any` for the update parameter. `agentMovementBuffer` is `Map<string, any>`. Clean these up.
- **`console.warn` in production paths** — Multiple `console.warn` calls in hot paths (`useAgents.ts`, `movementStore.ts`). Use the logger or remove them.

---

## 5. What Is Required for a Solid v1.0

### Non-Negotiable Ship Blockers (P0)

1. **Remove hardcoded agents** — PixDash must work with any OpenClaw Gateway configuration, not just the 6 specific agents in the codebase. This means: dynamic display names (from Gateway config), dynamic spawn positions (random or configurable), dynamic Staff view (auto-generated or user-configurable hierarchy).
2. **Add API authentication** — At minimum a shared secret header. The backend exposes sensitive agent data on an open port.
3. **Clean up dead code** — Remove stubbed movement methods, unused collision map loading, debug logging infrastructure. Ship maintainable code.
4. **Add onboarding / first-run experience** — Explain what PixDash is, what it needs (Gateway connection), and how to configure it. An empty office with no guidance is a failed first impression.
5. **Fix log pagination** — The `LogViewer` component should support loading more logs. 100 entries with no way to see older activity is a data cliff.

### Should Have (P1)

6. **Full customizer UI** — Expose all appearance fields, not just body type presets.
7. **Connected views** — Click agent in Staff → camera pans to them in Office.
8. **Reconnect button** — Manual Gateway reconnection trigger from the UI.
9. **Error boundary** — Catch and display backend connection failures gracefully instead of silent empty states.
10. **Responsive layout** — At minimum, hide the sidebar on small screens and make the canvas full-width. Ideally, a mobile-optimized single-column layout.

### Nice to Have (P2)

11. **Day-night cycle**
12. **Activity feed / timeline**
13. **Sound effects**
14. **Keyboard shortcuts**
15. **Mini-map**

### Polish That Separates Demo from Product

- Smooth transitions between views (Office ↔ Staff)
- Agent count badge on Staff view tab
- Timestamp formatting that respects the selected timezone consistently
- A favicon and proper `<title>` with live agent count
- Open Graph meta tags for sharing screenshots
- 404/error pages that match the pixel-art aesthetic
- Loading states that match the pixel-art aesthetic (not just plain text)

---

## 6. Recommended Priorities / Roadmap

### Phase 1: Make It Work for Everyone (P0)
| Item | Effort | Why |
|------|--------|-----|
| Dynamic agent discovery | Medium | Without this, PixDash only works for one specific setup |
| Remove hardcoded Staff hierarchy | Small | Same reason — blocks any other deployment |
| API auth (shared secret) | Small | Security requirement for any public deployment |
| Dead code cleanup | Small | Ship clean code, reduce confusion |
| Onboarding / empty state | Small | Failed first impression kills adoption |

### Phase 2: Make It Feel Complete (P1)
| Item | Effort | Why |
|------|--------|-----|
| Full character customizer | Medium | The type system supports it, users expect it |
| Connected views (Staff ↔ Office) | Small | Makes the product feel cohesive |
| Manual reconnect button | Small | Current UX is confusing when connection drops |
| Error boundary + recovery UI | Small | Production apps need graceful failure |
| Responsive layout | Medium | Many users will try on tablets/phones |
| Log pagination | Small | 100-entry cliff is a data usability problem |

### Phase 3: Make It Delightful (P2)
| Item | Effort | Why |
|------|--------|-----|
| Activity feed / timeline | Medium | Transforms from "tech demo" to "monitoring tool" |
| Agent stats dashboard | Small | Surfaces data that's already collected but hidden |
| Day-night lighting cycle | Small | High charm, low effort |
| Sound effects | Small | Atmosphere multiplier |
| Keyboard shortcuts | Small | Power-user feature |
| Mini-map | Small | Navigation aid for large offices |

---

## Bottom Line

PixDash has **remarkably strong engineering foundations** for a project at this stage. The backend-authoritative architecture, real Gateway integration with proper auth, A* pathfinding with collision avoidance, and smooth dual-pipeline movement system are genuinely impressive. This is not a toy — it's a real system.

**The critical gap is that it's currently a bespoke dashboard for one specific OpenClaw setup.** The hardcoded agents, roles, hierarchy, and display names make it unusable for anyone else. Fixing this is the difference between "cool internal tool" and "releasable open-source product."

The second critical gap is **security** — the API is completely unauthenticated. This needs to be fixed before any public deployment.

Everything else is polish and feature expansion. The bones are excellent. Ship the dynamic agent support + auth + cleanup, and this is a credible v1.0.
