# 🏢 PixDash

> A pixel-art office simulator that brings your OpenClaw AI agents to life on screen.

PixDash renders a 2D isometric office where your agents walk around, sit at desks, attend meetings, grab coffee, and wander the halls — all driven in real-time by activity from the OpenClaw Gateway.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![pnpm](https://img.shields.io/badge/pnpm-10-f69220?logo=pnpm)

---

> 🎮 *Imagine a SNES-era office simulator — but the characters are your actual AI agents.*

---

## ✨ Features

- **Live Agent Visualization** — 6 OpenClaw agents rendered as SNES-style pixel-art sprites
- **Backend-Authoritative A\* Pathfinding** — agents navigate the office using real pathfinding with collision avoidance
- **Smooth Sub-Tile Movement** — buttery 50ms tick interpolation at 5 tiles/second
- **Status-Driven Routing** — agents route to desks, conference rooms, restrooms, dining, and reception based on their real-time status
- **Idle Wandering** — agents periodically wander to random waypoints when idle (weighted by type)
- **Reserved Seats** — each agent can have a dedicated desk
- **Conference Room** — agents walk in and sit down for meetings
- **Character Customization** — per-agent sprite presets with directional animations
- **Real-Time Sync** — WebSocket connection to the OpenClaw Gateway for live state updates

## 🏗 Architecture

PixDash is a **pnpm monorepo** with three packages:

```
pixdash/
├── packages/
│   ├── frontend/    # React 18 + Vite 5 + Zustand + HTML5 Canvas
│   ├── backend/     # Fastify + WebSocket + sharp (sprite generation)
│   └── shared/      # Shared TypeScript types and constants
├── assets/
│   ├── sprites/         # SNES-style character sprite sheets
│   ├── palettes/        # Color palettes for sprite generation
│   ├── office-layout.json
│   └── collision-grid.json
├── .env.example
└── package.json
```

| Package | Role |
|---------|------|
| **frontend** | Canvas renderer, UI overlay (shadcn/ui + Tailwind), Zustand state |
| **backend** | Gateway bridge, movement engine, pathfinding, sprite pipeline |
| **shared** | `AgentStatus`, `Direction`, and other cross-package types |

## 🧑‍💼 Agent Roster

| Agent | Description |
|-------|-------------|
| **Clawdie** | The boss — reserved seat at the corner desk |
| **Devo** | Full-stack orchestrator — always near the monitors |
| **DocClaw** | Documentation specialist — clean desk, organized |
| **Forbidden** | Security specialist — seat near the server room |
| **InfraLover** | DevOps guru — debugging at all hours |
| **Cornelio** | The new hire — eager and everywhere |

Each agent has a unique sprite preset with 4-directional walk animations rendered on HTML5 Canvas.

## 📋 Prerequisites

- **Node.js** 20+
- **pnpm** 10+
- **OpenClaw Gateway** running (provides the WebSocket feed)

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/clawdieclawdita/Pixdash.git
cd Pixdash

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env — set PIXDASH_GATEWAY_URL to your Gateway WebSocket address

# Build all packages
pnpm build

# Start development mode (frontend + backend)
pnpm dev
```

Open **http://localhost:5173** (or whatever Vite assigns) and watch your agents come to life.

## ⚙️ Configuration

All settings live in `.env` (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PIXDASH_HOST` | `0.0.0.0` | Backend bind address |
| `PIXDASH_PORT` | `3000` | Backend HTTP/WebSocket port |
| `PIXDASH_GATEWAY_URL` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL |
| `PIXDASH_DEBUG` | `false` | Enable verbose frontend logging |

## 🎨 Agent Sprites

Sprites live in `assets/sprites/` with per-agent directories. Each character has:

- **4 directional sheets** — north, south, east, west
- **Walk cycle frames** — 3+ frames per direction
- **Seated variants** — for desk/conference/restroom poses
- **Palette-driven generation** via `sharp` — colors defined in `assets/palettes/`

To add a new agent:

1. Create a sprite directory under `assets/sprites/<agent-name>/`
2. Add directional sheet PNGs
3. Define the character preset in the shared types
4. Add a waypoint entry in `packages/backend/src/data/waypoints.ts`

## 🛠 Development

```bash
# Dev mode (hot reload for frontend, --watch for backend)
pnpm dev

# Build all packages
pnpm build

# Build a single package
pnpm --filter backend build
pnpm --filter frontend build
pnpm --filter @pixdash/shared build
```

### Office Layout

The office map is defined in `assets/office-layout.json` with a corresponding collision grid in `assets/collision-grid.json`. Waypoints (desks, restrooms, etc.) are configured in `packages/backend/src/data/waypoints.ts`.

### Waypoint Types

| Type | Behavior |
|------|----------|
| `desk` | Agent sits and works (direction-dependent sprite offset) |
| `reception` | Front desk seating |
| `conference` | Meeting room chairs |
| `restroom` | Self-explanatory |
| `dining` | Break room / kitchen area |

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and test locally
4. Commit with clear messages: `git commit -m "Add coffee machine waypoint"`
5. Push and open a Pull Request

## 📜 License

MIT

---

Built with ❤️ and way too much attention to pixel detail.
