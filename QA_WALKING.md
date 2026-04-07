# QA Walking Report

## Environment
- Project: `/home/pschivo/.openclaw/workspace-devo/pixdash`
- Backend started with: `node packages/backend/dist/server.js`
- Browser note: sandbox browser was unavailable in this runtime, so visual QA used host browser plus Playwright against `http://127.0.0.1:3000`

## Results

### 1) Backend health
- ✅ PASS: `GET /api/v1/health`
- Evidence: returned `{"ok":true,"service":"pixdash-backend"}`

### 2) Agents API
- ✅ PASS: `GET /api/v1/agents`
- Evidence: returned 5 agents with `position` and `status`
- Note: payload includes positions like `{ x: 2, y: 8, direction: "south" }` and statuses like `idle` / `working`

### 3) Initial UI load
- ✅ PASS: page loads and canvas renders
- ✅ PASS: office background is visible
- ⚠️ ISSUE: agents are not clearly visible in the initial viewport at default camera state, despite roster showing 5 online
- Evidence:
  - `test-screenshots/qa-walking-01-homepage.png`
  - `test-screenshots/qa-walking-02-office-canvas.png`
  - `test-screenshots/qa-walking-03-after-interaction.png`

### 4) Console / realtime connection
- ❌ FAIL: realtime websocket is disconnected
- Console error:
  - `WebSocket connection to 'ws://127.0.0.1:3000/ws' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED`
- UI evidence: Playwright captured `REALTIME Disconnected`

### 5) Agent initial movement state
- ⚠️ PARTIAL: no walking observed during QA run
- Expected note says agents should be standing initially when idle, but current frontend defaults idle agents to `seated-idle`
- No live movement transitions were observed because realtime websocket was down and no status transitions were triggered during the session

### 6) Canvas render quality
- ✅ PASS: canvas context exists and renders non-empty output
- ✅ PASS: no browser JS exceptions were observed
- ⚠️ ISSUE: practical visibility of sprites is poor in the default view, making initial QA of walking state difficult

## Console findings
- Warnings observed for every agent:
  - `[PixDash] Agent "main" is missing a valid position. Falling back to office desk placement.`
  - same warning for `devo`, `docclaw`, `forbidden`, `infralover`
- Error observed:
  - `WebSocket connection to 'ws://127.0.0.1:3000/ws' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED`

## Source review

### `packages/frontend/src/lib/waypoints.ts`
- ❌ FAIL: waypoint coordinates do not match the backend office layout dimensions
- Backend `/api/v1/office/layout` reports a `20 x 15` tile layout
- Waypoints use coordinates up to `71,53`, which indicates a different map/grid than the API layout
- This mismatch is large enough to break pathing or destination validity if both systems are meant to represent the same office

### `packages/frontend/src/lib/pathfinding.ts`
- ✅ PASS: A* logic is structurally correct for 4-direction grid movement
- Notes: bounded by `isWalkableTile`, reconstructs path correctly, returns empty path on invalid start/goal

### `packages/frontend/src/lib/movement.ts`
- ✅ PASS: interpolation logic is reasonable
- Notes: direction updates correctly, path advances by remaining distance, walk frame cycling looks fine

### `packages/frontend/src/store/movementStore.ts`
- ⚠️ ISSUE: initial state expectation mismatch
- `handleStatusChange(..., 'idle')` routes idle agents toward restroom/watercooler seating, and arrival state becomes `seated-idle`, not `standing`
- If product expectation is "idle agents should be standing initially", current logic does not match that behavior

### `packages/frontend/src/components/canvas/AgentRenderer.ts`
- ✅ PASS: walk animation wiring appears correct
- Notes: `isMoving = movementState === 'walking' || path.length > 0`, and `getWalkFrameIndex(isMoving)` is used correctly

## Most likely issues needing fixes
1. **Position format mismatch between backend and frontend**
   - `/api/v1/agents` returns small coordinates like tile positions (`2,8`), but frontend `normalizePosition()` only accepts values greater than `32` and otherwise falls back to desk placement.
   - This is why all agents log missing-position warnings.

2. **Realtime websocket endpoint not available**
   - `/ws` connection is refused, so live movement/state updates cannot function.

3. **Office layout mismatch**
   - Backend office layout is `20x15`, but frontend movement waypoints target a much larger coordinate space.

4. **Idle-state behavior mismatch with QA expectation**
   - Current logic prefers `seated-idle`, not `standing`.

5. **Default camera/view makes agents hard to verify visually**
   - Even with canvas rendering, the initial view does not make character visibility obvious enough for reliable walking QA.

## Artifacts
- `test-screenshots/qa-walking-01-homepage.png`
- `test-screenshots/qa-walking-02-office-canvas.png`
- `test-screenshots/qa-walking-03-after-interaction.png`
