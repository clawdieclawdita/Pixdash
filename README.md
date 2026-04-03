# PixDash — Business Office Simulator

Pixel-art 2D office (SNES-style) for OpenClaw agents. Watch your agents work, walk, and live in real-time.

![Alpha](https://img.shields.io/badge/status-alpha-orange)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-monorepo-blue)

## Features

- **Live agent office** — pixel-art canvas with animated sprite agents
- **Real-time Gateway connection** — authenticates via Ed25519 challenge-response, subscribes to agent events
- **Click to inspect** — select any agent to see status, config, logs, and tasks
- **Pan & zoom** — drag to pan, scroll to zoom the office floor
- **Appearance customization** — per-agent pixel-art appearances with customizable body, hair, outfit, and accessories
- **WebSocket live updates** — session messages, tool calls, and status changes stream in real-time

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite 5, Tailwind CSS, shadcn/ui, Zustand, HTML5 Canvas |
| Backend | Fastify, WebSocket, Node.js |
| Shared | TypeScript types, JSON schemas, constants |
| Runtime | pnpm monorepo (3 packages) |

## Prerequisites

- Node.js ≥ 18
- pnpm ≥ 8
- OpenClaw Gateway running (for live agent data)

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the backend (serves frontend too)
node packages/backend/dist/server.js

# Open http://localhost:3000
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `PIXDASH_GATEWAY_URL` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL |
| `PIXDASH_GATEWAY_TOKEN` | — | Gateway auth token |
| `PIXDASH_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `PIXDASH_HOST` | `0.0.0.0` | Backend bind address |
| `PIXDASH_PORT` | `3000` | Backend listen port |

Tokens are resolved in order: `OPENCLAW_GATEWAY_TOKEN` → `PIXDASH_GATEWAY_TOKEN` → config → `~/.openclaw/openclaw.json`.

## Docker

```bash
docker compose up -d
```

Mounts `~/.openclaw:ro` for Gateway token access.

## Architecture

```
pixdash/
├── packages/
│   ├── frontend/   # React + Canvas UI
│   ├── backend/    # Fastify + WebSocket + Gateway client
│   └── shared/     # TypeScript types & schemas
├── assets/         # Office layout & palettes
├── docker-compose.yml
└── Dockerfile
```

## Project Structure

- `AgentRenderer` — Canvas sprite rendering with selection glow
- `GatewayClient` — Ed25519 device auth, event subscription, agent list
- `AgentStateManager` — In-memory agent state with collision detection
- `OfficeCanvas` — Interactive pan/zoom/click canvas with camera controller
- `TilemapRenderer` — Multi-layer tilemap rendering (floor, walls, furniture)

## License

MIT
