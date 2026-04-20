# PixDash Installation Guide

## 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 20+ | Alpine image uses `node:20-alpine` |
| **pnpm** | 10.17.1 | Pinned in `packageManager` field |
| **OpenClaw Gateway** | Running | Must expose WebSocket on port 18789 |
| **libvips** | System package | Required by `sharp` for sprite processing; auto-installed in Docker via `vips` / `vips-dev` |
| **OS** | Linux, macOS, or WSL2 | Docker Compose uses `network_mode: host` (not supported on Docker Desktop for Mac/Windows without workarounds) |

### Verify prerequisites

```bash
node --version    # v20.x+
pnpm --version    # 10.17.1
# Verify Gateway is reachable
curl -s http://127.0.0.1:18789/health 2>/dev/null && echo "Gateway OK" || echo "Gateway not responding"
```

> **Docker Desktop note:** `network_mode: host` works natively on Linux. On macOS/Windows Docker Desktop, you must use the host's LAN IP in `PIXDASH_GATEWAY_URL` and bind to `0.0.0.0`, since the container shares the host network namespace on Linux but not on Docker Desktop.

---

## 2. Installation Methods

### Method A: Git Clone (Recommended for Development)

```bash
git clone https://github.com/clawdieclawdita/Pixdash.git
cd Pixdash
pnpm install
cp .env.example .env
# Edit .env — at minimum set PIXDASH_GATEWAY_URL
pnpm build
```

After building, start with development hot-reload:

```bash
pnpm dev
```

Or start the production backend with the script:

```bash
./start.sh
```

### Method B: Docker Compose (Recommended for Production)

```bash
git clone https://github.com/clawdieclawdita/Pixdash.git
cd Pixdash
cp .env.example .env
# Edit .env — gateway URL MUST use host LAN IP (e.g., ws://192.168.1.200:18789)
docker compose up -d --build
```

The Docker setup uses `network_mode: host`, so the container shares the host network stack. Port defaults to `5555` in Docker (vs `3000` for local dev).

### Method C: Script-Based (start.sh / stop.sh)

#### start.sh

Builds all packages, then launches the backend as a background process:

```bash
./start.sh
```

Behavior:
- Loads `.env` if present
- Runs `./stop.sh` first to kill any existing instance
- Builds all packages (`pnpm -r build`)
- Starts `packages/backend/dist/server.js` in the background
- If `PIXDASH_DEV_MODE=true`, runs with `--watch --enable-source-maps`
- Defaults: `PIXDASH_HOST=192.168.1.200`, `PIXDASH_PORT=3000`
- PID file: `~/.openclaw/pixdash/pixdash.pid`
- Log file: `~/.openclaw/pixdash/pixdash.log`

#### stop.sh

```bash
./stop.sh
```

Behavior:
- Reads PID from `~/.openclaw/pixdash/pixdash.pid` and sends `SIGTERM`
- Falls back to `pkill` matching `pixdash/packages/backend/dist/server.js` if PID file is stale
- Removes the PID file

---

## 3. Environment Variables

All variables are defined in `.env.example`. Copy it to `.env` and adjust.

| Variable | Default | Description | Required | Docker Notes |
|----------|---------|-------------|----------|--------------|
| `PIXDASH_HOST` | `0.0.0.0` | Backend bind address | Optional | Set to `0.0.0.0` in compose |
| `PIXDASH_PORT` | `3000` | Backend HTTP/WS port | Optional | Defaults to `5555` in Docker Compose |
| `PIXDASH_GATEWAY_URL` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL | **Yes** | Must use host LAN IP for Docker (e.g., `ws://192.168.1.200:18789`) |
| `PIXDASH_DEBUG` | `false` | Enable verbose frontend logging (`true`/`false`) | Optional | — |
| `PIXDASH_OFFICE_LAYOUT_PATH` | Auto-detected | Path to `office-layout.json` | Optional | Docker sets to `/app/assets/office-layout.json` |
| `PIXDASH_OPENCLAW_CONFIG` | Auto-detected (`$HOME/.openclaw/openclaw.json`) | Path to OpenClaw config (Gateway token) | Optional | Docker sets to `/root/.openclaw/openclaw.json` |
| `PIXDASH_APPEARANCES_PATH` | Auto-detected (`$HOME/.openclaw/pixdash/appearances.json`) | Path to appearances JSON | Optional | — |

### Optional: Dev Mode

Set `PIXDASH_DEV_MODE=true` in `.env` before running `./start.sh` to enable `--watch` and source maps.

---

## 4. Configuration Files

### pixdash.json

Controls agent display names, roles, organizational hierarchy, reserved waypoints, and spawn positions.

```json
{
  "displayNames": {
    "agent-one": "Agent One",
    "agent-two": "Agent Two",
    "agent-three": "Agent Three"
  },
  "roles": {
    "agent-one": "Executive",
    "agent-two": "Lead",
    "agent-three": "Security"
  },
  "hierarchy": [
    { "parent": "agent-one", "child": "agent-two" },
    { "parent": "agent-two", "child": "agent-three" }
  ],
  "reservedWaypoints": {
    "agent-one": "reception-front"
  },
  "spawnPositions": [
    { "x": 3, "y": 22 },
    { "x": 6, "y": 22 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `displayNames` | `Record<string, string>` | Maps agent keys (from Gateway) to human-readable names shown in the UI |
| `roles` | `Record<string, string>` | Maps agent keys to job titles displayed in tooltips/overlays |
| `hierarchy` | `Array<{parent, child}>` | Defines org-chart parent-child relationships between agents |
| `reservedWaypoints` | `Record<string, string>` | Assigns named waypoints to specific agents (e.g., a reserved desk) |
| `spawnPositions` | `Array<{x, y}>` | Tile-grid coordinates where agents initially appear |

### .env

Runtime configuration (see [Environment Variables](#3-environment-variables)).

---

## 5. First-Run Setup

### Step 1 — Clone and Install

```bash
git clone https://github.com/clawdieclawdita/Pixdash.git
cd Pixdash
pnpm install
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set `PIXDASH_GATEWAY_URL` to your Gateway's WebSocket address:

```bash
# Local dev (Gateway on same machine)
PIXDASH_GATEWAY_URL=ws://127.0.0.1:18789

# Docker or remote Gateway — use the host's LAN IP
PIXDASH_GATEWAY_URL=ws://192.168.1.200:18789
```

### Step 3 — Configure Agent Roster

Edit `pixdash.json` to match your OpenClaw agent keys. The keys under `displayNames`, `roles`, and `reservedWaypoints` must match the agent identifiers used by your Gateway.

### Step 4 — Build and Start

```bash
pnpm build
./start.sh
# or for Docker:
# docker compose up -d --build
```

### Step 5 — Verify Health

```bash
# Local dev (default port 3000)
curl http://localhost:3000/api/v1/health

# Docker (default port 5555)
curl http://localhost:5555/api/v1/health
```

You should get a `200 OK` response.

### Step 6 — Open Browser

Navigate to the configured host and port:

- **Dev mode:** `http://localhost:5173` (Vite dev server)
- **Production / start.sh:** `http://192.168.1.200:3000`
- **Docker:** `http://192.168.1.200:5555`

### Step 7 — What You Should See

A pixel-art isometric office with agent sprites. If the Gateway connection is live and agents are registered, you'll see agents walking around, heading to desks, and navigating the office in real time.

---

## 6. Troubleshooting

### Gateway Connection Refused

**Symptom:** Backend logs show `ECONNREFUSED` when connecting to `PIXDASH_GATEWAY_URL`.

**Fix:**
1. Verify the Gateway is running: `openclaw gateway status`
2. Confirm the URL and port match: `curl http://127.0.0.1:18789/health`
3. For Docker, ensure `PIXDASH_GATEWAY_URL` uses the host LAN IP (not `localhost` or `127.0.0.1`), unless using `network_mode: host` on Linux

### AUTH_TOKEN_MISMATCH

**Symptom:** Backend connects to Gateway but authentication fails.

**Fix:**
- The backend reads the Gateway token from `openclaw.json`. Ensure the mounted config file (or `PIXDASH_OPENCLAW_CONFIG` path) points to a valid config with the correct token.

### Port Already in Use (EADDRINUSE)

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`

**Fix:**
1. Stop existing PixDash: `./stop.sh`
2. Check what's using the port: `ss -ltnp | grep :3000`
3. Change `PIXDASH_PORT` in `.env` if the port is claimed by another service

### Agents Not Appearing

**Symptom:** Office renders but no agent sprites are visible.

**Fix:**
1. Check `/api/v1/agents` response: `curl http://localhost:3000/api/v1/agents`
2. Verify agent keys in `pixdash.json` match the Gateway's registered agent IDs
3. Confirm the Gateway is actually streaming agent state

### Empty /api/v1/agents Response

**Symptom:** The endpoint returns `[]` or an empty object.

**Fix:**
- Ensure the Gateway has active agents. PixDash mirrors what the Gateway reports.
- Check that the WebSocket connection to the Gateway is established in the backend logs.

### Docker Networking Issues

**Symptom:** Container starts but can't reach the Gateway.

**Fix:**
- `network_mode: host` is used, so on Linux the container shares the host network. Verify the Gateway is bound to `0.0.0.0` or `127.0.0.1`.
- On Docker Desktop (Mac/Windows), `network_mode: host` doesn't work the same way. Use the host machine's LAN IP and ensure the Gateway is accessible from that interface.

### sharp / libvips Build Failures

**Symptom:** `sharp` installation fails with native compilation errors.

**Fix:**
1. Ensure `pnpm install` runs on the correct Node version (20+)
2. On Linux, install libvips: `sudo apt install libvips-dev` (Debian/Ubuntu) or `sudo apk add vips-dev build-base` (Alpine)
3. The Dockerfile handles this automatically with `apk add vips-dev build-base`

### Config File Not Found

**Symptom:** Backend logs show a missing `pixdash.json` or `office-layout.json`.

**Fix:**
- `pixdash.json` must be in the project root. It's copied automatically in Docker via the Dockerfile.
- `office-layout.json` is auto-detected from `./assets/` in local dev, or mounted via the `./assets` volume in Docker.
- If auto-detection fails, set `PIXDASH_OFFICE_LAYOUT_PATH` explicitly.

---

## 7. Upgrading

```bash
cd Pixdash
git pull origin main
pnpm install          # Pick up new dependencies
pnpm build            # Rebuild all packages
./stop.sh             # Stop the running instance
./start.sh            # Restart with the new build
```

### Docker Upgrade

```bash
cd Pixdash
git pull origin main
docker compose up -d --build    # Rebuilds the image and restarts
```

Docker Compose will detect changed files, rebuild the image, and replace the running container. The `assets/` volume and `.env` file persist across upgrades.
