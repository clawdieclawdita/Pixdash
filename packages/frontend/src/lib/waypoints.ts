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

/** Create a seated waypoint with automatic visual offset (1 tile in facing direction). */
const seated = (
  id: string, x: number, y: number, type: WaypointType, direction: Direction,
): WaypointClaim => {
  const offsets: Record<Direction, [number, number]> = {
    north: [0, -TILE], south: [0, TILE], east: [TILE, 0], west: [-TILE, 0],
  };
  const [ox, oy] = offsets[direction];
  return createWaypoint(id, x, y, type, direction, ox, oy);
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
    // ── Upper desk cluster LEFT (cols 4-17) ──
    seated('desk-a1', 5, 18, 'desk', 'south'),
    seated('desk-a2', 15, 18, 'desk', 'south'),
    seated('desk-a3', 5, 25, 'desk', 'east'),
    seated('desk-a4', 16, 25, 'desk', 'west'),

    // ── Upper desk cluster CENTER (cols 20-34) ──
    seated('desk-b1', 23, 18, 'desk', 'south'),
    seated('desk-b2', 31, 18, 'desk', 'south'),
    seated('desk-b3', 22, 25, 'desk', 'east'),
    seated('desk-b4', 31, 23, 'desk', 'south'),

    // ── Upper desk cluster RIGHT (cols 36-50) ──
    seated('desk-c1', 37, 19, 'desk', 'east'),
    seated('desk-c2', 47, 18, 'desk', 'south'),
    seated('desk-c3', 37, 25, 'desk', 'east'),
    seated('desk-c4', 48, 25, 'desk', 'west'),

    // ── Lower desk island A (row 33) ──
    seated('desk-d1', 25, 33, 'desk', 'south'),
    seated('desk-d2', 30, 33, 'desk', 'south'),
    seated('desk-d3', 40, 33, 'desk', 'south'),
    seated('desk-d4', 45, 33, 'desk', 'south'),

    // ── Lower desk island B (row 41) ──
    seated('desk-e1', 26, 41, 'desk', 'west'),
    seated('desk-e2', 29, 41, 'desk', 'east'),
    seated('desk-e3', 41, 41, 'desk', 'west'),
    seated('desk-e4', 44, 41, 'desk', 'east'),

    // ── Lower desk island C (row 46) ──
    seated('desk-f1', 26, 46, 'desk', 'west'),
    seated('desk-f2', 29, 46, 'desk', 'east'),
    seated('desk-f3', 41, 46, 'desk', 'west'),
    seated('desk-f4', 43, 46, 'desk', 'east'),

    // ── Lower desk island D (row 52) ──
    seated('desk-g1', 26, 52, 'desk', 'west'),
    seated('desk-g2', 29, 52, 'desk', 'east'),
    seated('desk-g3', 38, 52, 'desk', 'east'),
    seated('desk-g4', 44, 52, 'desk', 'east'),
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
    // Top end of table
    seated('conf-top', 63, 9, 'conference', 'south'),
    // Left side of table (5 chairs, face east toward table)
    seated('conf-l1', 61, 10, 'conference', 'east'),
    seated('conf-l2', 61, 13, 'conference', 'east'),
    seated('conf-l3', 59, 18, 'conference', 'east'),
    seated('conf-l4', 61, 23, 'conference', 'east'),
    seated('conf-l5', 61, 28, 'conference', 'east'),
    // Right side of table (5 chairs, face west toward table)
    seated('conf-r1', 68, 10, 'conference', 'west'),
    seated('conf-r2', 68, 13, 'conference', 'west'),
    seated('conf-r3', 67, 18, 'conference', 'west'),
    seated('conf-r4', 69, 21, 'conference', 'west'),
    seated('conf-r5', 67, 24, 'conference', 'west'),
    // Bottom end of table
    seated('conf-bottom', 66, 28, 'conference', 'north'),
  ],

  waterDispenser: [createWaypoint('watercooler-1', 63, 33, 'watercooler', 'south')],
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

  return [...available].sort((left, right) => distanceBetweenTiles(origin, left) - distanceBetweenTiles(origin, right))[0] ?? null;
};
