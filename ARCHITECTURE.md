# PixDash — Technical Architecture Specification

> **Version:** 1.0  
> **Date:** 2026-04-02  
> **Status:** Phase 1 Complete  
> **Author:** Architect Specialist (glm-5)

---

## Table of Contents

1. [Tech Stack & Folder Structure](#1-tech-stack--folder-structure)
2. [API Contract (Backend ↔ Frontend)](#2-api-contract-backend--frontend)
3. [Sprite Schema Definition](#3-sprite-schema-definition)
4. [Tilemap Format](#4-tilemap-format)
5. [Data Flow Diagram](#5-data-flow-diagram)
6. [WebSocket Message Types](#6-websocket-message-types)
7. [Project File Structure](#7-project-file-structure)

---

## 1. Tech Stack & Folder Structure

### 1.1 Overview

PixDash is a **monorepo** with two main packages:
- **`packages/frontend`** — React SPA with Canvas office scene
- **`packages/backend`** — Node.js WebSocket bridge to OpenClaw Gateway

### 1.2 Frontend Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Framework** | React 18+ | Component-based UI, hooks, ecosystem |
| **Build Tool** | Vite 5+ | Fast HMR, native ES modules, simple config |
| **Styling** | Tailwind CSS 3+ | Utility-first, rapid prototyping |
| **UI Components** | shadcn/ui | Accessible, customizable, Tailwind-native |
| **Office Rendering** | HTML5 Canvas | Pixel-perfect rendering, sprite layering, animations |
| **State Management** | Zustand | Lightweight, minimal boilerplate |
| **HTTP Client** | ky | Fetch wrapper with hooks |
| **WebSocket Client** | native WebSocket API | No abstraction needed |

### 1.3 Backend Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Runtime** | Node.js 20+ | WebSocket support, non-blocking I/O |
| **Framework** | Fastify | Fast, schema-based validation, async/await |
| **WebSocket Server** | @fastify/websocket | Native Fastify integration |
| **WebSocket Client** | ws | Connect to OpenClaw Gateway |
| **Config Reader** | fs + chokidar | Watch OpenClaw config files for changes |
| **Validation** | ajv | JSON schema validation |
| **Logging** | pino | Structured logging, Fastify default |

### 1.4 Development Tooling

| Tool | Purpose |
|------|---------|
| **pnpm** | Monorepo workspace management |
| **TypeScript** | Type safety across frontend/backend |
| **ESLint** | Linting (airbnb-base + React rules) |
| **Prettier** | Code formatting |
| **Vitest** | Unit/integration tests |
| **Playwright** | E2E tests |
| **Docker** | Containerization |
| **docker-compose** | Multi-container orchestration |

### 1.5 Monorepo Structure

```
pixdash/
├── packages/
│   ├── frontend/          # React SPA
│   │   ├── src/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   └── package.json
│   ├── backend/           # WebSocket bridge
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/            # Shared types/utilities
│       ├── src/
│       │   ├── types/     # TypeScript interfaces
│       │   ├── schemas/   # JSON schemas
│       │   └── constants/
│       └── package.json
├── docker/
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── docker-compose.yml
├── docs/
│   ├── ARCHITECTURE.md    # This file
│   ├── API.md             # API documentation
│   └── SPRITES.md         # Sprite schema docs
├── assets/
│   ├── tiles/             # Tile PNGs (future: generated procedurally)
│   ├── sprites/           # Base sprite parts (future: generated)
│   └── palettes/          # Color palettes
├── scripts/
│   └── generate-sprites.ts
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── README.md
```

### 1.6 Dev Setup Commands

```bash
# Install dependencies
pnpm install

# Development (run both frontend + backend)
pnpm dev

# Development (individual)
pnpm --filter frontend dev    # http://localhost:5173
pnpm --filter backend dev     # http://localhost:3000

# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint

# Docker
docker-compose up -d
```

---

## 2. API Contract (Backend ↔ Frontend)

### 2.1 Base URL

- **REST API:** `http://localhost:3000/api/v1`
- **WebSocket:** `ws://localhost:3000/ws`

### 2.2 REST Endpoints

#### 2.2.1 GET `/agents` — List all agents

**Response:**
```json
{
  "agents": [
    {
      "id": "agent:devo:telegram:group:-1003723628918",
      "name": "Devo",
      "status": "online",
      "lastSeen": "2026-04-02T18:00:00Z",
      "position": { "x": 5, "y": 8 },
      "appearance": {
        "bodyType": "male",
        "hair": { "style": "short", "color": "#2C1810" },
        "skinColor": "#E8BEAC",
        "outfit": { "type": "casual", "color": "#3B5998" }
      }
    }
  ]
}
```

#### 2.2.2 GET `/agents/:id` — Get agent details

**Response:**
```json
{
  "id": "agent:devo:telegram:group:-1003723628918",
  "name": "Devo",
  "status": "online",
  "lastSeen": "2026-04-02T18:00:00Z",
  "position": { "x": 5, "y": 8 },
  "appearance": { /* see above */ },
  "config": {
    "model": "zai/glm-5",
    "channel": "telegram",
    "workspace": "/home/pschivo/.openclaw/workspace-devo"
  },
  "stats": {
    "messagesProcessed": 1234,
    "tasksCompleted": 56,
    "uptimeSeconds": 86400
  }
}
```

#### 2.2.3 GET `/agents/:id/logs` — Get agent logs

**Query Params:**
- `limit` (default: 100)
- `offset` (default: 0)
- `level` (optional: info, warn, error)

**Response:**
```json
{
  "logs": [
    {
      "id": "log_abc123",
      "timestamp": "2026-04-02T18:00:00Z",
      "level": "info",
      "message": "Processed message from user",
      "metadata": {
        "userId": "telegram:123456",
        "duration": 1.2
      }
    }
  ],
  "total": 1234,
  "hasMore": true
}
```

#### 2.2.4 GET `/agents/:id/tasks` — Get agent tasks

**Response:**
```json
{
  "tasks": [
    {
      "id": "task_xyz789",
      "type": "subagent",
      "status": "running",
      "createdAt": "2026-04-02T17:55:00Z",
      "updatedAt": "2026-04-02T18:00:00Z",
      "description": "Spawn Backend Specialist for API work"
    }
  ]
}
```

#### 2.2.5 PATCH `/agents/:id/appearance` — Update agent appearance

**Request:**
```json
{
  "hair": { "color": "#FF0000" },
  "outfit": { "color": "#00FF00" }
}
```

**Response:**
```json
{
  "success": true,
  "appearance": { /* updated appearance */ }
}
```

#### 2.2.6 GET `/office/layout` — Get office tilemap

**Response:**
```json
{
  "width": 20,
  "height": 15,
  "tileSize": 32,
  "layers": {
    "floor": [ /* tile IDs */ ],
    "walls": [ /* tile IDs */ ],
    "furniture": [ /* tile IDs */ ]
  }
}
```

### 2.3 WebSocket Events

#### 2.3.1 Connection

Frontend connects to `ws://localhost:3000/ws` and receives:

**Server → Client:**
```json
{
  "type": "connected",
  "clientId": "client_abc123"
}
```

#### 2.3.2 Agent Events

**Server → Client:**
```json
{
  "type": "event",
  "event": "agent:status",
  "payload": {
    "agentId": "agent:devo:...",
    "status": "idle",
    "timestamp": "2026-04-02T18:00:00Z"
  }
}
```

**Server → Client:**
```json
{
  "type": "event",
  "event": "agent:position",
  "payload": {
    "agentId": "agent:devo:...",
    "position": { "x": 6, "y": 8 },
    "direction": "east"
  }
}
```

**Server → Client:**
```json
{
  "type": "event",
  "event": "agent:log",
  "payload": {
    "agentId": "agent:devo:...",
    "log": {
      "id": "log_xyz",
      "level": "info",
      "message": "Task completed"
    }
  }
}
```

**Server → Client:**
```json
{
  "type": "event",
  "event": "agent:task",
  "payload": {
    "agentId": "agent:devo:...",
    "task": {
      "id": "task_abc",
      "status": "completed"
    }
  }
}
```

### 2.4 TypeScript Interfaces

```typescript
// packages/shared/src/types/agent.ts

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  lastSeen: string;
  position: Position;
  appearance: Appearance;
  config?: AgentConfig;
  stats?: AgentStats;
}

export type AgentStatus = 'online' | 'idle' | 'offline' | 'busy';

export interface Position {
  x: number;
  y: number;
  direction?: Direction;
}

export type Direction = 'north' | 'south' | 'east' | 'west';

export interface Appearance {
  bodyType: BodyType;
  hair: Hair;
  skinColor: string;
  outfit: Outfit;
  accessories?: Accessory[];
}

export type BodyType = 'male' | 'female' | 'neutral';

export interface Hair {
  style: HairStyle;
  color: string;
}

export type HairStyle = 'short' | 'long' | 'bald' | 'ponytail' | 'spiky';

export interface Outfit {
  type: OutfitType;
  color: string;
}

export type OutfitType = 'casual' | 'formal' | 'hoodie' | 'tank-top';

export interface Accessory {
  type: AccessoryType;
  color?: string;
}

export type AccessoryType = 'glasses' | 'hat' | 'headphones' | 'watch';
```

---

## 3. Sprite Schema Definition

### 3.1 Design Philosophy

Sprites are **procedurally generated** from JSON schemas using a layered approach:
1. **Base body** (body type + skin color)
2. **Hair layer** (style + color)
3. **Outfit layer** (type + color)
4. **Accessory layers** (optional)

This allows infinite variations without storing sprite sheets.

### 3.2 Sprite Dimensions

| Property | Value | Rationale |
|----------|-------|-----------|
| **Base Size** | 16x16 pixels | SNES standard (Chrono Trigger style) |
| **Scaled Size** | 32x32 (2x) | Crisp rendering on modern displays |
| **Frame Count** | 4 per animation | Idle: 4 frames, Walk: 4 frames |
| **Directional** | 4 directions | N, S, E, W (South is default) |

### 3.3 JSON Schema for Appearance

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "bodyType": {
      "type": "string",
      "enum": ["male", "female", "neutral"],
      "default": "neutral"
    },
    "hair": {
      "type": "object",
      "properties": {
        "style": {
          "type": "string",
          "enum": ["short", "long", "bald", "ponytail", "spiky"],
          "default": "short"
        },
        "color": {
          "type": "string",
          "pattern": "^#[0-9A-Fa-f]{6}$",
          "default": "#2C1810"
        }
      },
      "required": ["style", "color"]
    },
    "skinColor": {
      "type": "string",
      "pattern": "^#[0-9A-Fa-f]{6}$",
      "default": "#E8BEAC"
    },
    "outfit": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["casual", "formal", "hoodie", "tank-top"],
          "default": "casual"
        },
        "color": {
          "type": "string",
          "pattern": "^#[0-9A-Fa-f]{6}$",
          "default": "#3B5998"
        }
      },
      "required": ["type", "color"]
    },
    "accessories": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["glasses", "hat", "headphones", "watch"]
          },
          "color": {
            "type": "string",
            "pattern": "^#[0-9A-Fa-f]{6}$"
          }
        },
        "required": ["type"]
      },
      "default": []
    }
  },
  "required": ["bodyType", "hair", "skinColor", "outfit"]
}
```

### 3.4 Sprite Generation Algorithm

```typescript
// Pseudocode for procedural sprite generation

function generateSprite(appearance: Appearance): SpriteSheet {
  const baseSize = 16;
  const frames = 4;
  const directions = ['south', 'north', 'east', 'west'];
  
  const spriteSheet = createCanvas(baseSize * frames, baseSize * directions.length);
  
  directions.forEach((dir, dirIndex) => {
    for (let frame = 0; frame < frames; frame++) {
      const x = frame * baseSize;
      const y = dirIndex * baseSize;
      
      // Layer 1: Body (base shape + skin color)
      drawBody(spriteSheet, x, y, appearance.bodyType, appearance.skinColor, dir, frame);
      
      // Layer 2: Outfit (clothing shape + color)
      drawOutfit(spriteSheet, x, y, appearance.outfit, dir, frame);
      
      // Layer 3: Hair (style shape + color)
      if (appearance.hair.style !== 'bald') {
        drawHair(spriteSheet, x, y, appearance.hair, dir, frame);
      }
      
      // Layer 4: Accessories (optional layers)
      appearance.accessories.forEach(acc => {
        drawAccessory(spriteSheet, x, y, acc, dir, frame);
      });
    }
  });
  
  return spriteSheet;
}
```

### 3.5 Animation Frames

#### Idle Animation (4 frames)
- Frame 0: Base pose
- Frame 1: Slight breathe up (+1px Y offset)
- Frame 2: Base pose
- Frame 3: Slight breathe down (-1px Y offset)

#### Walk Animation (4 frames per direction)
- Frame 0: Left foot forward
- Frame 1: Feet together
- Frame 2: Right foot forward
- Frame 3: Feet together

### 3.6 Color Palettes

Predefined palettes for quick customization:

```json
{
  "skinTones": [
    "#FFDBB4",
    "#EDB98A",
    "#E8BEAC",
    "#D08B5B",
    "#AE5D29",
    "#614335"
  ],
  "hairColors": [
    "#2C1810",
    "#6A4E42",
    "#B55239",
    "#E6CEA8",
    "#DCD0BA",
    "#9C8467"
  ],
  "outfitColors": [
    "#3B5998",
    "#8B9DC3",
    "#FF5733",
    "#2ECC71",
    "#F39C12",
    "#9B59B6"
  ]
}
```

---

## 4. Tilemap Format

### 4.1 Tile Dimensions

| Property | Value |
|----------|-------|
| **Tile Size** | 32x32 pixels |
| **Grid Size** | 20x15 tiles (640x480 pixels at 1x zoom) |
| **Zoom Levels** | 1x, 2x, 3x |

### 4.2 Layer Structure

The tilemap uses **3 layers** (painter's algorithm for rendering):

1. **Floor Layer** — Ground tiles (always behind agents)
2. **Furniture Layer** — Desks, chairs, plants (agents render behind/in front based on Y position)
3. **Wall Layer** — Walls, doors (always in front of agents)

### 4.3 Tile Types

#### Floor Tiles
| ID | Name | Description |
|----|------|-------------|
| 0 | `floor_wood` | Brown wood planks |
| 1 | `floor_tile` | Gray square tiles |
| 2 | `floor_carpet` | Blue carpet |
| 3 | `floor_concrete` | Gray concrete |

#### Wall Tiles
| ID | Name | Description |
|----|------|-------------|
| 10 | `wall_north` | North wall (top edge) |
| 11 | `wall_south` | South wall (bottom edge) |
| 12 | `wall_west` | West wall (left edge) |
| 13 | `wall_east` | East wall (right edge) |
| 14 | `wall_corner_nw` | Northwest corner |
| 15 | `wall_corner_ne` | Northeast corner |
| 16 | `wall_corner_sw` | Southwest corner |
| 17 | `wall_corner_se` | Southeast corner |
| 18 | `door_ns` | Door (north-south) |
| 19 | `door_ew` | Door (east-west) |

#### Furniture Tiles
| ID | Name | Z-Order | Description |
|----|------|---------|-------------|
| 20 | `desk_wood` | Low | Wooden desk |
| 21 | `desk_metal` | Low | Metal desk |
| 22 | `chair_wood` | High | Wooden chair |
| 23 | `chair_metal` | High | Metal chair |
| 24 | `plant_small` | Low | Small potted plant |
| 25 | `plant_large` | Low | Large plant |
| 26 | `bookshelf` | Low | Bookshelf |
| 27 | `water_cooler` | Low | Water cooler |
| 28 | `coffee_machine` | Low | Coffee machine |

### 4.4 Tilemap JSON Format

```json
{
  "version": 1,
  "width": 20,
  "height": 15,
  "tileSize": 32,
  "layers": {
    "floor": [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // ... 15 rows
    ],
    "furniture": [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 20, 0, 0, 20, 0, 0, 20, 0, 0, 20, 0, 0, 20, 0, 0, 0, 0, 0],
      [0, 0, 22, 0, 0, 22, 0, 0, 22, 0, 0, 22, 0, 0, 22, 0, 0, 0, 0, 0],
      // ... 15 rows
    ],
    "walls": [
      [14, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 15],
      [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13],
      // ... 15 rows
    ]
  },
  "spawnPoints": [
    { "x": 2, "y": 2 },
    { "x": 5, "y": 2 },
    { "x": 8, "y": 2 }
  ],
  "walkable": [
    // 2D array of booleans (true = walkable)
  ]
}
```

### 4.5 Z-Ordering Rules

Agents render **between** furniture layer and wall layer based on Y position:

```
Render Order (back to front):
1. Floor layer (all tiles)
2. Furniture layer (tiles with Y < agentY)
3. Agent sprites (sorted by Y position)
4. Furniture layer (tiles with Y >= agentY)
5. Wall layer (all tiles)
```

**Implementation:**
```typescript
function renderOffice(canvas: Canvas, agents: Agent[]) {
  // 1. Render floor
  renderLayer(canvas, tilemap.layers.floor);
  
  // 2. Render furniture behind agents
  renderFurnitureLayer(canvas, tilemap.layers.furniture, { maxY: minAgentY - 1 });
  
  // 3. Render agents (sorted by Y)
  const sortedAgents = agents.sort((a, b) => a.position.y - b.position.y);
  sortedAgents.forEach(agent => renderAgent(canvas, agent));
  
  // 4. Render furniture in front of agents
  renderFurnitureLayer(canvas, tilemap.layers.furniture, { minY: minAgentY });
  
  // 5. Render walls
  renderLayer(canvas, tilemap.layers.walls);
}
```

### 4.6 Tileset Format (Future)

For v2, support external tilesets from **Tiled Map Editor**:
- Export format: JSON
- Tileset image: `tileset.png` (32x32 tiles)
- External tileset file: `tileset.json`

---

## 5. Data Flow Diagram

### 5.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenClaw Gateway                         │
│                      (ws://127.0.0.1:18789)                      │
│                                                                   │
│  • Agent registry                                                 │
│  • Real-time status events                                        │
│  • Log streaming                                                  │
│  • Task updates                                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ WebSocket (Gateway Protocol)
                            │ Auth: Challenge-Response
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      PixDash Backend                             │
│                   (Node.js + Fastify)                            │
│                      ws://localhost:3000                         │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Gateway Client                                          │   │
│  │  • Maintains persistent WS connection to Gateway         │   │
│  │  • Handles auth handshake                                │   │
│  │  • Subscribes to agent events                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Config Watcher                                          │   │
│  │  • Watches OpenClaw config files (~/.openclaw/*.json)    │   │
│  │  • Parses agent definitions                              │   │
│  │  • Emits change events                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Agent State Manager                                     │   │
│  │  • Merges Gateway events + config file data              │   │
│  │  • Stores appearance configs                             │   │
│  │  • Broadcasts updates to frontend clients                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  REST API                                                │   │
│  │  • GET /agents                                           │   │
│  │  • GET /agents/:id                                       │   │
│  │  • GET /agents/:id/logs                                  │   │
│  │  • GET /agents/:id/tasks                                 │   │
│  │  • PATCH /agents/:id/appearance                          │   │
│  │  • GET /office/layout                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  WebSocket Server                                        │   │
│  │  • Broadcasts agent events to all connected clients      │   │
│  │  • Handles appearance update requests                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ WebSocket + REST
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      PixDash Frontend                            │
│                   (React + Vite + Canvas)                        │
│                      http://localhost:5173                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React UI Layer (Tailwind + shadcn/ui)                  │   │
│  │  • Agent detail panels                                   │   │
│  │  • Character customizer modal                            │   │
│  │  • Settings/config viewer                                │   │
│  │  • Log viewer                                            │   │
│  │  • Task viewer                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Zustand State Store                                     │   │
│  │  • agents: Map<id, Agent>                                │   │
│  │  • selectedAgentId: string | null                        │   │
│  │  • officeLayout: Tilemap                                 │   │
│  │  • uiState: { modal, panel, etc. }                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Canvas Renderer (HTML5 Canvas)                          │   │
│  │  • Tilemap rendering (floor, walls, furniture)           │   │
│  │  • Sprite rendering (agents with Z-ordering)             │   │
│  │  • Animation loop (60 FPS)                               │   │
│  │  • Click detection (agent selection)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Sprite Generator                                        │   │
│  │  • Procedural sprite generation from JSON schema         │   │
│  │  • Caching (generated sprites stored in memory)          │   │
│  │  • Animation frame cycling                               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Real-Time Event Flow

```
[OpenClaw Gateway]
       │
       │ 1. Agent status change (e.g., "busy")
       ├─ WS Event: { type: "event", event: "agent:status", payload: {...} }
       │
[Backend: Gateway Client]
       │
       │ 2. Receive and validate event
       ├─ Validate against JSON schema
       │
[Backend: Agent State Manager]
       │
       │ 3. Update internal state
       ├─ Merge with existing agent data
       │
       │ 4. Broadcast to frontend clients
       ├─ WS Broadcast: { type: "event", event: "agent:status", payload: {...} }
       │
[Frontend: WebSocket Client]
       │
       │ 5. Receive event
       ├─ Parse JSON
       │
[Frontend: Zustand Store]
       │
       │ 6. Update state
       ├─ agents.set(agentId, updatedAgent)
       │
[Frontend: Canvas Renderer]
       │
       │ 7. Re-render scene
       ├─ Update agent sprite (e.g., show "busy" indicator)
       │
[Canvas]
       │
       └─ User sees updated agent state in office
```

### 5.3 Appearance Update Flow

```
[User clicks "Customize" on agent]
       │
       │ 1. Open customizer modal
       │
[User changes hair color to red]
       │
       │ 2. PATCH /agents/:id/appearance
       ├─ Request: { hair: { color: "#FF0000" } }
       │
[Backend: REST API]
       │
       │ 3. Validate request
       ├─ Check color format (hex)
       ├─ Merge with existing appearance
       │
[Backend: Agent State Manager]
       │
       │ 4. Persist appearance
       ├─ Save to ~/.openclaw/pixdash/appearances.json
       │
       │ 5. Broadcast update
       ├─ WS Broadcast: { type: "event", event: "agent:appearance", payload: {...} }
       │
[Frontend: Sprite Generator]
       │
       │ 6. Regenerate sprite
       ├─ Call generateSprite(updatedAppearance)
       ├─ Cache new sprite
       │
[Frontend: Canvas Renderer]
       │
       │ 7. Re-render agent
       ├─ Draw new sprite in next frame
       │
[Canvas]
       │
       └─ User sees agent with red hair
```

---

## 6. WebSocket Message Types

### 6.1 Backend ↔ OpenClaw Gateway

#### 6.1.1 Connection Handshake

**Gateway → Backend:**
```json
{
  "type": "auth_challenge",
  "nonce": "abc123xyz",
  "timestamp": "2026-04-02T18:00:00Z"
}
```

**Backend → Gateway:**
```json
{
  "type": "auth_response",
  "identity": "pixdash-backend",
  "role": "observer",
  "scopes": ["agents:read", "agents:subscribe"],
  "token": "<HMAC(nonce + timestamp + secret)>",
  "device": {
    "type": "server",
    "hostname": "salman"
  }
}
```

**Gateway → Backend:**
```json
{
  "type": "auth_success",
  "sessionId": "session_xyz789"
}
```

#### 6.1.2 Subscribe to Agent Events

**Backend → Gateway:**
```json
{
  "type": "req",
  "id": "req_001",
  "method": "subscribe",
  "params": {
    "events": ["agent:status", "agent:log", "agent:task"]
  }
}
```

**Gateway → Backend:**
```json
{
  "type": "res",
  "id": "req_001",
  "ok": true,
  "payload": {
    "subscribed": ["agent:status", "agent:log", "agent:task"]
  }
}
```

#### 6.1.3 Request Agent List

**Backend → Gateway:**
```json
{
  "type": "req",
  "id": "req_002",
  "method": "getAgents",
  "params": {}
}
```

**Gateway → Backend:**
```json
{
  "type": "res",
  "id": "req_002",
  "ok": true,
  "payload": {
    "agents": [
      {
        "id": "agent:devo:...",
        "name": "Devo",
        "status": "online"
      }
    ]
  }
}
```

#### 6.1.4 Inbound Events (Gateway → Backend)

**Agent Status Change:**
```json
{
  "type": "event",
  "event": "agent:status",
  "payload": {
    "agentId": "agent:devo:...",
    "status": "busy",
    "timestamp": "2026-04-02T18:00:00Z"
  }
}
```

**Agent Log:**
```json
{
  "type": "event",
  "event": "agent:log",
  "payload": {
    "agentId": "agent:devo:...",
    "log": {
      "id": "log_abc123",
      "timestamp": "2026-04-02T18:00:00Z",
      "level": "info",
      "message": "Task started",
      "metadata": {}
    }
  }
}
```

**Agent Task Update:**
```json
{
  "type": "event",
  "event": "agent:task",
  "payload": {
    "agentId": "agent:devo:...",
    "task": {
      "id": "task_xyz789",
      "status": "running",
      "type": "subagent",
      "description": "Backend Specialist for API work"
    }
  }
}
```

### 6.2 Backend ↔ Frontend

#### 6.2.1 Connection

**Frontend → Backend:**
```
CONNECT ws://localhost:3000/ws
```

**Backend → Frontend:**
```json
{
  "type": "connected",
  "clientId": "client_abc123",
  "serverVersion": "1.0.0"
}
```

#### 6.2.2 Initial Data Sync

**Frontend → Backend:**
```json
{
  "type": "req",
  "id": "req_001",
  "method": "sync"
}
```

**Backend → Frontend:**
```json
{
  "type": "res",
  "id": "req_001",
  "ok": true,
  "payload": {
    "agents": [ /* all agents */ ],
    "officeLayout": { /* tilemap */ }
  }
}
```

#### 6.2.3 Inbound Events (Backend → Frontend)

**Agent Status:**
```json
{
  "type": "event",
  "event": "agent:status",
  "payload": {
    "agentId": "agent:devo:...",
    "status": "idle",
    "timestamp": "2026-04-02T18:00:00Z"
  }
}
```

**Agent Position (for future movement):**
```json
{
  "type": "event",
  "event": "agent:position",
  "payload": {
    "agentId": "agent:devo:...",
    "position": { "x": 5, "y": 8 },
    "direction": "south"
  }
}
```

**Agent Appearance Update:**
```json
{
  "type": "event",
  "event": "agent:appearance",
  "payload": {
    "agentId": "agent:devo:...",
    "appearance": { /* updated appearance */ }
  }
}
```

**Agent Log:**
```json
{
  "type": "event",
  "event": "agent:log",
  "payload": {
    "agentId": "agent:devo:...",
    "log": {
      "id": "log_xyz",
      "level": "info",
      "message": "Task completed",
      "timestamp": "2026-04-02T18:00:00Z"
    }
  }
}
```

**Agent Task:**
```json
{
  "type": "event",
  "event": "agent:task",
  "payload": {
    "agentId": "agent:devo:...",
    "task": {
      "id": "task_abc",
      "status": "completed",
      "type": "subagent"
    }
  }
}
```

#### 6.2.4 Outbound Requests (Frontend → Backend)

**Update Appearance:**
```json
{
  "type": "req",
  "id": "req_002",
  "method": "updateAppearance",
  "params": {
    "agentId": "agent:devo:...",
    "appearance": {
      "hair": { "color": "#FF0000" }
    }
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "req_002",
  "ok": true,
  "payload": {
    "appearance": { /* merged appearance */ }
  }
}
```

**Move Agent (for future pathfinding):**
```json
{
  "type": "req",
  "id": "req_003",
  "method": "moveAgent",
  "params": {
    "agentId": "agent:devo:...",
    "position": { "x": 6, "y": 8 }
  }
}
```

### 6.3 Authentication Flow Sequence

```
Frontend                Backend                  Gateway
   │                      │                        │
   │──── Connect WS ────►│                        │
   │                      │                        │
   │◄─── { connected } ───│                        │
   │                      │                        │
   │                      │──── Connect WS ──────►│
   │                      │                        │
   │                      │◄─── auth_challenge ────│
   │                      │                        │
   │                      │──── auth_response ────►│
   │                      │                        │
   │                      │◄─── auth_success ──────│
   │                      │                        │
   │                      │──── subscribe ────────►│
   │                      │                        │
   │                      │◄─── { ok: true } ──────│
   │                      │                        │
   │──── sync ──────────►│                        │
   │                      │                        │
   │◄─── agents + map ────│                        │
   │                      │                        │
   │                      │◄─── agent:status ──────│
   │                      │                        │
   │◄─── agent:status ────│                        │
   │                      │                        │
```

---

## 7. Project File Structure

### 7.1 Complete Directory Tree

```
pixdash/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, test, build
│       └── deploy.yml                # Docker build + push
│
├── .vscode/
│   ├── settings.json
│   └── extensions.json
│
├── packages/
│   ├── frontend/
│   │   ├── public/
│   │   │   ├── favicon.ico
│   │   │   └── manifest.json
│   │   │
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── canvas/
│   │   │   │   │   ├── OfficeCanvas.tsx       # Main canvas component
│   │   │   │   │   ├── TilemapRenderer.ts     # Tile rendering logic
│   │   │   │   │   ├── AgentRenderer.ts       # Sprite rendering
│   │   │   │   │   └── CameraController.ts    # Pan/zoom controls
│   │   │   │   │
│   │   │   │   ├── ui/
│   │   │   │   │   ├── AgentPanel.tsx         # Agent detail sidebar
│   │   │   │   │   ├── AgentStatus.tsx        # Status indicator
│   │   │   │   │   ├── ConfigViewer.tsx       # Config display
│   │   │   │   │   ├── LogViewer.tsx          # Log list + filter
│   │   │   │   │   ├── TaskViewer.tsx         # Task list
│   │   │   │   │   └── CustomizerModal.tsx    # Appearance editor
│   │   │   │   │
│   │   │   │   └── layout/
│   │   │   │       ├── AppLayout.tsx          # Main layout wrapper
│   │   │   │       ├── Header.tsx             # Top nav bar
│   │   │   │       └── Sidebar.tsx            # Agent list sidebar
│   │   │   │
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts            # WS connection hook
│   │   │   │   ├── useAgents.ts               # Agent state hook
│   │   │   │   ├── useCanvas.ts               # Canvas animation hook
│   │   │   │   └── useSprites.ts              # Sprite generation hook
│   │   │   │
│   │   │   ├── lib/
│   │   │   │   ├── api.ts                     # REST API client
│   │   │   │   ├── sprite-generator.ts        # Procedural sprite gen
│   │   │   │   ├── tilemap-loader.ts          # Tilemap parsing
│   │   │   │   └── utils.ts                   # Helper functions
│   │   │   │
│   │   │   ├── store/
│   │   │   │   ├── agentsStore.ts             # Zustand store for agents
│   │   │   │   ├── uiStore.ts                 # UI state (modals, panels)
│   │   │   │   └── settingsStore.ts           # User preferences
│   │   │   │
│   │   │   ├── types/
│   │   │   │   └── index.ts                   # Frontend-specific types
│   │   │   │
│   │   │   ├── App.tsx                        # Root component
│   │   │   ├── main.tsx                       # Entry point
│   │   │   └── index.css                      # Tailwind imports
│   │   │
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   ├── postcss.config.js
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── backend/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── agents.ts                  # Agent REST endpoints
│   │   │   │   ├── office.ts                  # Office layout endpoint
│   │   │   │   └── health.ts                  # Health check
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── GatewayClient.ts           # WS client to Gateway
│   │   │   │   ├── ConfigWatcher.ts           # File watcher for configs
│   │   │   │   ├── AgentStateManager.ts       # State management
│   │   │   │   └── AppearanceStore.ts         # Persist appearances
│   │   │   │
│   │   │   ├── websocket/
│   │   │   │   ├── server.ts                  # WS server for frontend
│   │   │   │   └── handlers.ts                # Message handlers
│   │   │   │
│   │   │   ├── schemas/
│   │   │   │   ├── agent.schema.json          # Agent validation
│   │   │   │   ├── appearance.schema.json     # Appearance validation
│   │   │   │   └── event.schema.json          # Event validation
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── index.ts                   # Config loader
│   │   │   │   └── defaults.ts                # Default values
│   │   │   │
│   │   │   ├── types/
│   │   │   │   └── index.ts                   # Backend-specific types
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts                  # Pino logger wrapper
│   │   │   │   └── validation.ts              # Schema validation helpers
│   │   │   │
│   │   │   └── server.ts                      # Fastify app entry
│   │   │
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   │   ├── agent.ts                   # Agent interfaces
│       │   │   ├── tilemap.ts                 # Tilemap interfaces
│       │   │   ├── sprite.ts                  # Sprite interfaces
│       │   │   ├── event.ts                   # WS event types
│       │   │   └── index.ts
│       │   │
│       │   ├── schemas/
│       │   │   ├── appearance.schema.json
│       │   │   └── tilemap.schema.json
│       │   │
│       │   └── constants/
│       │       ├── colors.ts                  # Color palettes
│       │       └── defaults.ts                # Default values
│       │
│       ├── tsconfig.json
│       ├── package.json
│       └── README.md
│
├── docker/
│   ├── Dockerfile.frontend             # Multi-stage build for React
│   ├── Dockerfile.backend              # Node.js runtime
│   ├── docker-compose.yml              # Full stack orchestration
│   └── nginx.conf                      # Nginx config for frontend
│
├── assets/
│   ├── tiles/
│   │   ├── floor/
│   │   │   ├── wood.png
│   │   │   ├── tile.png
│   │   │   └── carpet.png
│   │   │
│   │   ├── walls/
│   │   │   ├── wall_north.png
│   │   │   ├── wall_south.png
│   │   │   └── corner_*.png
│   │   │
│   │   └── furniture/
│   │       ├── desk_wood.png
│   │       ├── chair_wood.png
│   │       ├── plant_small.png
│   │       └── bookshelf.png
│   │
│   ├── sprites/
│   │   ├── bodies/
│   │   │   ├── male_base.png
│   │   │   └── female_base.png
│   │   │
│   │   ├── hair/
│   │   │   ├── short.png
│   │   │   ├── long.png
│   │   │   └── ponytail.png
│   │   │
│   │   └── outfits/
│   │       ├── casual.png
│   │       ├── formal.png
│   │       └── hoodie.png
│   │
│   └── palettes/
│       ├── skin-tones.json
│       ├── hair-colors.json
│       └── outfit-colors.json
│
├── docs/
│   ├── ARCHITECTURE.md                 # This file
│   ├── API.md                          # API documentation
│   ├── SPRITES.md                      # Sprite schema guide
│   ├── TILEMAP.md                      # Tilemap format guide
│   └── DEPLOYMENT.md                   # Deployment guide
│
├── scripts/
│   ├── generate-sprites.ts             # CLI to generate sprite sheets
│   ├── validate-tilemap.ts             # Validate tilemap JSON
│   └── seed-office.ts                  # Create default office layout
│
├── test/
│   ├── e2e/
│   │   ├── office.spec.ts              # Canvas rendering tests
│   │   ├── agent-interaction.spec.ts   # Click agent flow
│   │   └── customizer.spec.ts          # Appearance update flow
│   │
│   └── integration/
│       ├── gateway-client.test.ts      # Gateway connection tests
│       └── api.test.ts                 # REST API tests
│
├── .env.example
├── .gitignore
├── .prettierrc
├── .eslintrc.js
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── PROJECT_LOG.md
└── README.md
```

### 7.2 Key File Responsibilities

| File | Responsibility |
|------|---------------|
| `packages/frontend/src/components/canvas/OfficeCanvas.tsx` | Main canvas component, orchestrates rendering |
| `packages/frontend/src/lib/sprite-generator.ts` | Procedural sprite generation from JSON |
| `packages/frontend/src/store/agentsStore.ts` | Zustand store for agent state |
| `packages/backend/src/services/GatewayClient.ts` | WebSocket client to OpenClaw Gateway |
| `packages/backend/src/services/ConfigWatcher.ts` | Watch OpenClaw config files |
| `packages/backend/src/websocket/server.ts` | WebSocket server for frontend clients |
| `packages/shared/src/types/agent.ts` | Shared TypeScript interfaces |
| `assets/tiles/` | Tile PNG images (future: procedural generation) |
| `assets/sprites/` | Base sprite part images (future: procedural) |

---

## Appendix A: Color Palette Reference

### Skin Tones
```json
[
  "#FFDBB4",  // Light
  "#EDB98A",  // Medium Light
  "#E8BEAC",  // Medium
  "#D08B5B",  // Medium Dark
  "#AE5D29",  // Dark
  "#614335"   // Deep
]
```

### Hair Colors
```json
[
  "#2C1810",  // Black
  "#6A4E42",  // Dark Brown
  "#B55239",  // Auburn
  "#E6CEA8",  // Blonde
  "#DCD0BA",  // Platinum
  "#9C8467"   // Gray
]
```

### Outfit Colors
```json
[
  "#3B5998",  // Facebook Blue
  "#8B9DC3",  // Light Blue
  "#FF5733",  // Red-Orange
  "#2ECC71",  // Green
  "#F39C12",  // Yellow
  "#9B59B6"   // Purple
]
```

---

## Appendix B: Future Enhancements (v2+)

- **Pathfinding**: A* algorithm for agent movement
- **Multi-room office**: Multiple tilemaps with doors
- **Agent interactions**: Chat bubbles, item exchange
- **Day/night cycle**: Lighting changes
- **Sound effects**: Footsteps, ambient office sounds
- **Sprite editor**: In-browser pixel art editor
- **Tiled integration**: Import/export Tiled Map Editor files
- **Custom tilesets**: User-uploaded tile images

---

## Revision History

| Version | Date       | Changes                          |
|---------|------------|----------------------------------|
| 1.0     | 2026-04-02 | Initial architecture specification |

---

**End of ARCHITECTURE.md**
