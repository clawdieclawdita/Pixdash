import type { Direction } from '@pixdash/shared';

export type WaypointType = 'desk' | 'restroom' | 'conference' | 'reception' | 'watercooler';

export interface TilePoint {
  x: number;
  y: number;
}

export interface Waypoint extends TilePoint {
  id: string;
  type: WaypointType;
  direction?: Direction;
  /** Pixel offset when rendering an agent seated at this waypoint.
   *  Visually places sprite on the chair (blocked tile) while pathfinding
   *  targets the walkable tile. */
  visualOffsetX?: number;
  visualOffsetY?: number;
}

export interface WaypointClaim extends Waypoint {
  claimedBy: string | null;
}

export interface WaypointSet {
  desks: WaypointClaim[];
  receptionChairs: WaypointClaim[];
  restRoomChairs: WaypointClaim[];
  conferenceRoomChairs: WaypointClaim[];
  waterDispenser: WaypointClaim[];
}

const TILE = 32;

const createWaypoint = (
  id: string, x: number, y: number, type: WaypointType, direction?: Direction,
  visualOffsetX?: number, visualOffsetY?: number,
): WaypointClaim => ({
  id, x, y, type, direction, claimedBy: null,
  visualOffsetX: visualOffsetX ?? 0, visualOffsetY: visualOffsetY ?? 0,
});

/** Create a seated waypoint with automatic visual offset, or a custom chair offset when provided. */
const seated = (
  id: string,
  x: number,
  y: number,
  type: WaypointType,
  direction: Direction,
  visualOffsetX?: number,
  visualOffsetY?: number,
): WaypointClaim => {
  const offsets: Record<Direction, [number, number]> = {
    north: [0, -TILE], south: [0, TILE], east: [TILE, 0], west: [-TILE, 0],
  };
  const [defaultOffsetX, defaultOffsetY] = offsets[direction];
  return createWaypoint(
    id,
    x,
    y,
    type,
    direction,
    visualOffsetX ?? defaultOffsetX,
    visualOffsetY ?? defaultOffsetY,
  );
};

/**
 * Waypoints — all coordinates are collision grid tiles (32×32 px each).
 * Image: 2400×1792 px → 75 cols × 56 rows.
 *
 * IMPORTANT: All waypoints are on WALKABLE tiles (verified against blocked.png).
 * Directions face toward the desk/chair/stall the agent is sitting at.
 *
 * Breakdown:
 *   Desks:      28 — upper clusters (rows 18/23/25, 3 clusters × 2 sides)
 *                    lower islands (rows 33/41/46/52, 4 per row)
 *   Reception:   7 — front desk area and bottom seating
 *   Restroom:    8 — stall corridors, left & right sections
 *   Conference: 12 — around conference table (left/right columns, top/bottom)
 *   Water:       1 — water cooler
 *
 */
export const createWaypointSet = (): WaypointSet => ({
  desks: [
    // ── Upper desk cluster LEFT (chair centers sampled from chairsspots.png) ──
    // North-side chairs (row 18): face south toward desk below
    seated('desk-a1', 6, 18, 'desk', 'south', 11, 30),
    seated('desk-a2', 15, 18, 'desk', 'south', 1, 33),
    // South-side chairs (rows 24-25): face north toward desk above
    seated('desk-a3', 7, 24, 'desk', 'north', -21, -22),
    seated('desk-a4', 16, 25, 'desk', 'north', -35, -11),

    // ── Upper desk cluster CENTER ──
    seated('desk-b1', 23, 18, 'desk', 'south', 1, 31),
    seated('desk-b2', 31, 18, 'desk', 'south', 12, 34),
    seated('desk-b3', 22, 25, 'desk', 'north', 33, -10),
    seated('desk-b4', 31, 26, 'desk', 'north', 13, -46),

    // ── Upper desk cluster RIGHT ──
    // User confirmed: right cluster chairs face south
    seated('desk-c1', 38, 18, 'desk', 'south', 12, 33),
    seated('desk-c2', 47, 18, 'desk', 'south', -9, 31),
    seated('desk-c3', 37, 25, 'desk', 'south', 44, -12),
    seated('desk-c4', 46, 24, 'desk', 'south', 23, 21),

    // ── Lower desk island A ──
    seated('desk-d1', 26, 34, 'desk', 'west', -43, 19),
    seated('desk-d2', 29, 34, 'desk', 'east', 43, 19),
    seated('desk-d3', 41, 34, 'desk', 'west', -40, 19),
    seated('desk-d4', 44, 34, 'desk', 'east', 46, 19),

    // ── Lower desk island B ──
    seated('desk-e1', 25, 42, 'desk', 'north', -11, -41),
    seated('desk-e2', 30, 42, 'desk', 'north', 11, -41),
    seated('desk-e3', 41, 41, 'desk', 'west', -40, -9),
    seated('desk-e4', 45, 42, 'desk', 'north', 14, -41),

    // ── Lower desk island C ──
    seated('desk-f1', 26, 46, 'desk', 'west', -43, -5),
    seated('desk-f2', 29, 46, 'desk', 'east', 43, -5),
    seated('desk-f3', 41, 46, 'desk', 'west', -40, -5),
    seated('desk-f4', 44, 46, 'desk', 'east', 45, -5),

    // ── Lower desk island D ──
    seated('desk-g1', 25, 53, 'desk', 'north', -11, -33),
    seated('desk-g2', 29, 52, 'desk', 'east', 43, -1),
    seated('desk-g3', 41, 52, 'desk', 'west', -40, -1),
    seated('desk-g4', 44, 52, 'desk', 'east', 46, -1),
  ],

  receptionChairs: [
    seated('reception-1', 4, 42, 'reception', 'east'),
    seated('reception-2', 7, 42, 'reception', 'east'),
    seated('reception-3', 10, 42, 'reception', 'west'),
    seated('reception-4', 0, 50, 'reception', 'east'),
    seated('reception-5', 5, 53, 'reception', 'south'),
    seated('reception-6', 7, 53, 'reception', 'south'),
    seated('reception-7', 8, 54, 'reception', 'east'),
  ],

  restRoomChairs: [
    // Left section - upper stalls
    seated('rest-1', 57, 47, 'restroom', 'west'),
    seated('rest-2', 55, 48, 'restroom', 'south'),
    // Left section - lower stalls
    seated('rest-3', 57, 51, 'restroom', 'west'),
    seated('rest-4', 55, 52, 'restroom', 'south'),
    // Right section - upper stalls
    seated('rest-5', 67, 47, 'restroom', 'east'),
    seated('rest-6', 71, 48, 'restroom', 'south'),
    // Right section - lower stalls
    seated('rest-7', 67, 51, 'restroom', 'east'),
    seated('rest-8', 71, 52, 'restroom', 'south'),
  ],

  conferenceRoomChairs: [
    // Walkable corridors: rows 6-9 (top), rows 27-30 (bottom)
    // Table: rows 10-26. Chairs on blocked tiles around table edge.
    // Top row (3 chairs facing table)
    seated('conf-top-1', 58, 9, 'conference', 'south', -5, 30),
    seated('conf-top-2', 63, 9, 'conference', 'south', 0, 30),
    seated('conf-top-3', 68, 9, 'conference', 'south', 5, 30),
    // Bottom row (6 chairs facing table)
    seated('conf-bot-1', 56, 28, 'conference', 'north', 0, -30),
    seated('conf-bot-2', 59, 28, 'conference', 'north', 0, -30),
    seated('conf-bot-3', 62, 28, 'conference', 'north', 0, -30),
    seated('conf-bot-4', 65, 28, 'conference', 'north', 0, -30),
    seated('conf-bot-5', 68, 28, 'conference', 'north', 0, -30),
    seated('conf-bot-6', 71, 28, 'conference', 'north', 0, -30),
    // Side chairs (2 chairs on edges)
    seated('conf-side-l', 56, 7, 'conference', 'east', 33, 0),
    seated('conf-side-r', 72, 7, 'conference', 'west', -33, 0),
  ],

  // Watercooler at (63,33) is on a blocked tile (no walkable path).
  // Removed from wander pool to prevent agents getting stuck.
  waterDispenser: [],
});

export const getAllWaypoints = (set: WaypointSet): WaypointClaim[] => [
  ...set.desks,
  ...set.receptionChairs,
  ...set.restRoomChairs,
  ...set.conferenceRoomChairs,
  ...set.waterDispenser,
];

export const createNoGoSet = (set: WaypointSet): Set<string> => {
  const noGo = new Set<string>();

  // Only block claimed chair tiles themselves — agents must walk through floor around them
  for (const waypoint of getAllWaypoints(set)) {
    if (waypoint.claimedBy) {
      noGo.add(`${waypoint.x},${waypoint.y}`);
    }
  }

  return noGo;
};

export const releaseWaypointClaim = (set: WaypointSet, agentId: string) => {
  for (const waypoint of getAllWaypoints(set)) {
    if (waypoint.claimedBy === agentId) {
      waypoint.claimedBy = null;
    }
  }
};

export const findWaypointById = (set: WaypointSet, waypointId: string | null | undefined) =>
  getAllWaypoints(set).find((waypoint) => waypoint.id === waypointId) ?? null;

export const claimWaypoint = (waypoint: WaypointClaim, agentId: string) => {
  waypoint.claimedBy = agentId;
  return waypoint;
};

export const distanceBetweenTiles = (from: TilePoint, to: TilePoint) => Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

export const pickNearestAvailableWaypoint = (
  candidates: WaypointClaim[],
  origin: TilePoint,
  agentId: string,
): WaypointClaim | null => {
  const available = candidates.filter((waypoint) => !waypoint.claimedBy || waypoint.claimedBy === agentId);
  if (available.length === 0) {
    return null;
  }

  // Sort by distance, then pick randomly from top-N nearest to spread agents.
  // Pure nearest-first causes all agents to cluster at the same chair.
  const sorted = [...available].sort(
    (left, right) => distanceBetweenTiles(origin, left) - distanceBetweenTiles(origin, right),
  );
  const topN = Math.min(sorted.length, 5);
  return sorted[Math.floor(Math.random() * topN)] ?? null;
};
