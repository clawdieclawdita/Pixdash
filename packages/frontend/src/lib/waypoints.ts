import type { Direction } from '@pixdash/shared';

export type WaypointType = 'desk' | 'restroom' | 'conference' | 'reception' | 'watercooler' | 'dining';

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
  dining: WaypointClaim[];
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
 *   Dining:      1 — dining room center
 *
 */
export const createWaypointSet = (): WaypointSet => ({
  desks: [
    // ── Upper desk cluster LEFT (chair centers sampled from chairsspots.png) ──
    // North-side chairs (row 18): face south toward desk below
    seated('desk-a1', 6, 18, 'desk', 'east', 11, 30),
    seated('desk-a2', 15, 18, 'desk', 'west', 1, 33),
    // South-side chairs (rows 24-25): face north toward desk above
    seated('desk-a3', 7, 24, 'desk', 'east', -21, -22),
    seated('desk-a4', 16, 25, 'desk', 'west', -35, -11),

    // ── Upper desk cluster CENTER ──
    seated('desk-b1', 23, 18, 'desk', 'east', 1, 31),
    seated('desk-b2', 31, 18, 'desk', 'west', 12, 34),
    seated('desk-b3', 22, 25, 'desk', 'east', 33, -10),
    seated('desk-b4', 31, 26, 'desk', 'west', 13, -46),

    // ── Upper desk cluster RIGHT ──
    // User confirmed: right cluster chairs face south
    seated('desk-c1', 38, 18, 'desk', 'east', 12, 33),
    seated('desk-c2', 47, 18, 'desk', 'west', -9, 31),
    seated('desk-c3', 37, 25, 'desk', 'east', 44, -12),
    seated('desk-c4', 46, 24, 'desk', 'west', 23, 21),

    // ── Lower desk island A (top-side chairs face south toward desks) ──
    seated('desk-d1', 26, 34, 'desk', 'south', -43, 19),
    seated('desk-d2', 29, 34, 'desk', 'south', 43, 19),
    seated('desk-d3', 41, 34, 'desk', 'south', -40, 19),
    seated('desk-d4', 44, 34, 'desk', 'south', 46, 19),

    // ── Lower desk island B (bottom-side chairs face north toward desks) ──
    seated('desk-e1', 25, 42, 'desk', 'north', -11, -41),
    seated('desk-e2', 30, 42, 'desk', 'north', 11, -41),
    seated('desk-e3', 41, 41, 'desk', 'north', -40, -9),
    seated('desk-e4', 45, 42, 'desk', 'north', 14, -41),

    // ── Lower desk island C (top-side chairs face south toward desks) ──
    seated('desk-f1', 26, 46, 'desk', 'south', -43, -5),
    seated('desk-f2', 29, 46, 'desk', 'south', 43, -5),
    seated('desk-f3', 41, 46, 'desk', 'south', -40, -5),
    seated('desk-f4', 44, 46, 'desk', 'south', 45, -5),

    // ── Lower desk island D (bottom-side chairs face north toward desks) ──
    seated('desk-g1', 25, 53, 'desk', 'north', -11, -33),
    seated('desk-g2', 29, 52, 'desk', 'north', 43, -1),
    seated('desk-g3', 41, 52, 'desk', 'north', -40, -1),
    seated('desk-g4', 44, 52, 'desk', 'north', 46, -1),
  ],

  receptionChairs: [
    // Clawdie's desk (main agent home base)
    seated('reception-clawdie', 7, 37, 'reception', 'south'),
    // General reception seats
    seated('reception-1', 4, 42, 'reception', 'south'),
    seated('reception-2', 7, 42, 'reception', 'north'),
    seated('reception-3', 10, 42, 'reception', 'north'),
    seated('reception-4', 0, 50, 'reception', 'east'),
    seated('reception-5', 5, 53, 'reception', 'north'),
    seated('reception-6', 7, 53, 'reception', 'north'),
    seated('reception-7', 8, 54, 'reception', 'north'),
  ],

  restRoomChairs: [
    // Left section - upper stalls (face west, toward stalls)
    seated('rest-1', 53, 47, 'restroom', 'west', 64, 0),
    seated('rest-2', 53, 48, 'restroom', 'west', 64, 0),
    // Left section - lower stalls
    seated('rest-3', 53, 51, 'restroom', 'west', 64, 0),
    seated('rest-4', 53, 52, 'restroom', 'west', 64, 0),
    // Right section - upper stalls (face east, toward stalls)
    seated('rest-5', 65, 47, 'restroom', 'east', 64, 0),
    seated('rest-6', 65, 48, 'restroom', 'east', 64, 0),
    // Right section - lower stalls
    seated('rest-7', 65, 51, 'restroom', 'east', 64, 0),
    seated('rest-8', 65, 52, 'restroom', 'east', 64, 0),
  ],

  conferenceRoomChairs: [
    // Verified against blocked.png: cols 56 and 72 are walkable for rows 7-28.
    // Table spans roughly cols 59-68 / rows 10-26, so side chairs stay on corridor tiles
    // with horizontal visual offsets to place agents onto the actual seats.
    // Head chairs (north/south ends)
    seated('conf-head-n', 63, 9, 'conference', 'south', 0, 30),
    seated('conf-head-s', 63, 28, 'conference', 'north', 0, -30),
    // West side chairs facing east toward table
    seated('conf-left-1', 56, 9, 'conference', 'east', 33, 0),
    seated('conf-left-2', 56, 13, 'conference', 'east', 33, 0),
    seated('conf-left-3', 56, 17, 'conference', 'east', 33, 0),
    seated('conf-left-4', 56, 21, 'conference', 'east', 33, 0),
    seated('conf-left-5', 56, 25, 'conference', 'east', 33, 0),
    // East side chairs facing west toward table
    seated('conf-right-1', 72, 9, 'conference', 'west', -33, 0),
    seated('conf-right-2', 72, 13, 'conference', 'west', -33, 0),
    seated('conf-right-3', 72, 17, 'conference', 'west', -33, 0),
    seated('conf-right-4', 72, 21, 'conference', 'west', -33, 0),
    seated('conf-right-5', 72, 25, 'conference', 'west', -33, 0),
  ],

  // Watercooler at (63,33) is on a blocked tile (no walkable path).
  // Removed from wander pool to prevent agents getting stuck.
  waterDispenser: [],

  // Breakroom/dining room center (tables area) — walkable tile
  dining: [
    // Center of the dining room area (tile ~64,46)
    createWaypoint('dining-center', 64, 46, 'dining', undefined),
  ],
});

export const getAllWaypoints = (set: WaypointSet): WaypointClaim[] => [
  ...set.desks,
  ...set.receptionChairs,
  ...set.restRoomChairs,
  ...set.conferenceRoomChairs,
  ...set.waterDispenser,
  ...set.dining,
];

export const createNoGoSet = (set: WaypointSet): Set<string> => {
  const noGo = new Set<string>();

  // Only block claimed chair tiles themselves — agents must walk through floor around them
  for (const waypoint of getAllWaypoints(set)) {
    if (waypoint.claimedBy) {
      noGo.add(`${waypoint.x},${waypoint.y}`);
    }
  }

  // Permanent no-go: restroom interior tiles (prevents agents walking on tables/counters)
  // Collected from blocked.png walkability scan.
  const restroomTiles: [number, number][] = [
    // Left restroom (cols 54-58, rows 45-54)
    [55,45],[56,45],[57,45],[58,45],
    [55,46],[56,46],[57,46],[58,46],
    [55,47],[56,47],[57,47],[58,47],
    [55,48],[56,48],[57,48],
    [56,49],[57,49],
    [56,51],[58,51],
    [55,52],[56,52],[57,52],
    [56,53],[57,53],
    [57,54],
    // Right restroom (cols 66-72, rows 45-54)
    [66,45],[67,45],[68,45],[69,45],[70,45],
    [66,46],[67,46],[68,46],[69,46],[70,46],
    [66,47],[67,47],[68,47],[69,47],[70,47],[71,47],
    [66,48],[67,48],[71,48],
    [66,49],[67,49],[71,49],
    [71,50],
    [67,51],[71,51],
    [66,52],[67,52],[71,52],
    [66,53],[67,53],[71,53],
    [67,54],[71,54],
  ];

  // Permanent no-go: desk surface tiles (blocked.png misses these)
  // Upper desk clusters A/B/C (rows 17-28)
  const deskTiles: [number, number][] = [
    // Cluster A (cols 8-14)
    [8,17],[9,17],[10,17],[11,17],[12,17],[13,17],[14,17],
    [8,18],[9,18],[10,18],[11,18],[12,18],[13,18],[14,18],
    [8,19],[9,19],[10,19],[11,19],[12,19],[13,19],[14,19],
    [8,20],[9,20],[10,20],[11,20],[12,20],[13,20],[14,20],
    [8,21],[9,21],[10,21],[11,21],[12,21],[13,21],[14,21],
    [8,22],[9,22],[10,22],[11,22],[12,22],[13,22],[14,22],
    [8,23],[9,23],[10,23],[11,23],[12,23],[13,23],[14,23],
    [8,24],[9,24],[10,24],[11,24],[12,24],[13,24],[14,24],
    [8,25],[9,25],[10,25],[11,25],[12,25],[13,25],[14,25],
    [8,26],[9,26],[10,26],[11,26],[12,26],[13,26],[14,26],
    [8,27],[9,27],[10,27],[11,27],[12,27],[13,27],[14,27],
    [8,28],[9,28],[10,28],[11,28],[12,28],[13,28],[14,28],
    // Cluster B (cols 24-30)
    [24,17],[25,17],[26,17],[27,17],[28,17],[29,17],[30,17],
    [24,18],[25,18],[26,18],[27,18],[28,18],[29,18],[30,18],
    [24,19],[25,19],[26,19],[27,19],[28,19],[29,19],[30,19],
    [24,20],[25,20],[26,20],[27,20],[28,20],[29,20],[30,20],
    [24,21],[25,21],[26,21],[27,21],[28,21],[29,21],[30,21],
    [24,22],[25,22],[26,22],[27,22],[28,22],[29,22],[30,22],
    [24,23],[25,23],[26,23],[27,23],[28,23],[29,23],[30,23],
    [24,24],[25,24],[26,24],[27,24],[28,24],[29,24],[30,24],
    [24,25],[25,25],[26,25],[27,25],[28,25],[29,25],[30,25],
    [24,26],[25,26],[26,26],[27,26],[28,26],[29,26],[30,26],
    [24,27],[25,27],[26,27],[27,27],[28,27],[29,27],[30,27],
    [24,28],[25,28],[26,28],[27,28],[28,28],[29,28],[30,28],
    // Cluster C (cols 39-46)
    [39,17],[40,17],[41,17],[42,17],[43,17],[44,17],[45,17],[46,17],
    [39,18],[40,18],[41,18],[42,18],[43,18],[44,18],[45,18],[46,18],
    [39,19],[40,19],[41,19],[42,19],[43,19],[44,19],[45,19],[46,19],
    [39,20],[40,20],[41,20],[42,20],[43,20],[44,20],[45,20],[46,20],
    [39,21],[40,21],[41,21],[42,21],[43,21],[44,21],[45,21],[46,21],
    [39,22],[40,22],[41,22],[42,22],[43,22],[44,22],[45,22],[46,22],
    [39,23],[40,23],[41,23],[42,23],[43,23],[44,23],[45,23],[46,23],
    [39,24],[40,24],[41,24],[42,24],[43,24],[44,24],[45,24],[46,24],
    [39,25],[40,25],[41,25],[42,25],[43,25],[44,25],[45,25],[46,25],
    [39,26],[40,26],[41,26],[42,26],[43,26],[44,26],[45,26],[46,26],
    [39,27],[40,27],[41,27],[42,27],[43,27],[44,27],[45,27],[46,27],
    [39,28],[40,28],[41,28],[42,28],[43,28],[44,28],[45,28],[46,28],
    // Lower island D (cols 23-32, rows 35-40)
    [23,35],[24,35],[25,35],[26,35],[27,35],[28,35],[29,35],[30,35],[31,35],[32,35],
    [22,36],[23,36],[24,36],[25,36],[26,36],[27,36],[28,36],[29,36],[30,36],[31,36],[32,36],[33,36],
    [22,37],[23,37],[24,37],[25,37],[26,37],[27,37],[28,37],[29,37],[30,37],[31,37],[32,37],[33,37],
    [22,38],[23,38],[24,38],[25,38],[26,38],[27,38],[28,38],[29,38],[30,38],[31,38],[32,38],[33,38],
    [23,39],[24,39],[25,39],[26,39],[27,39],[28,39],[29,39],[30,39],[31,39],[32,39],[33,39],
    [25,40],[26,40],[29,40],[30,40],[32,40],[33,40],
    // Lower island E (cols 38-48, rows 35-40)
    [38,35],[39,35],[40,35],[41,35],[42,35],[43,35],[44,35],[45,35],[46,35],[47,35],[48,35],
    [37,36],[38,36],[39,36],[40,36],[41,36],[42,36],[43,36],[44,36],[45,36],[46,36],[47,36],[48,36],
    [37,37],[38,37],[39,37],[40,37],[41,37],[42,37],[43,37],[44,37],[45,37],[46,37],[47,37],[48,37],
    [37,38],[38,38],[39,38],[40,38],[41,38],[42,38],[43,38],[44,38],[45,38],[46,38],[47,38],[48,38],
    [37,39],[38,39],[39,39],[40,39],[41,39],[42,39],[43,39],[44,39],[45,39],[46,39],[47,39],[48,39],
    [40,40],[41,40],[44,40],[45,40],[47,40],[48,40],
    // Lower island F (cols 23-33, rows 47-51)
    [23,47],[24,47],[25,47],[26,47],[27,47],[28,47],[29,47],[30,47],[31,47],[32,47],[33,47],
    [23,48],[24,48],[25,48],[26,48],[27,48],[28,48],[29,48],[30,48],[31,48],[32,48],[33,48],
    [23,49],[24,49],[25,49],[26,49],[27,49],[28,49],[29,49],[30,49],[31,49],[32,49],[33,49],
    [23,50],[24,50],[25,50],[26,50],[27,50],[28,50],[29,50],[30,50],[31,50],[32,50],[33,50],
    [25,51],[26,51],[29,51],[30,51],[32,51],[33,51],
    // Lower island G (cols 38-48, rows 47-51)
    [38,47],[39,47],[40,47],[41,47],[42,47],[43,47],[44,47],[45,47],[46,47],[47,47],[48,47],
    [38,48],[39,48],[40,48],[41,48],[42,48],[43,48],[44,48],[45,48],[46,48],[47,48],[48,48],
    [38,49],[39,49],[40,49],[41,49],[42,49],[43,49],[44,49],[45,49],[46,49],[47,49],[48,49],
    [38,50],[39,50],[40,50],[41,50],[42,50],[43,50],[44,50],[45,50],[46,50],[47,50],[48,50],
    [40,51],[41,51],[44,51],[45,51],[47,51],[48,51],
  ];

  // Build exclusion set for all waypoint tiles so destinations stay reachable
  const waypointTiles = new Set(
    getAllWaypoints(set).map((wp) => `${wp.x},${wp.y}`)
  );

  for (const [x, y] of [...restroomTiles, ...deskTiles]) {
    const key = `${x},${y}`;
    if (!waypointTiles.has(key)) {
      noGo.add(key);
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
  if (waypoint.id === 'reception-clawdie' && agentId !== 'main') {
    console.error('[PixDash] 🚨 RESERVED SEAT VIOLATION: reception-clawdie claimed by', agentId, '— stack trace:', new Error().stack);
  }
  waypoint.claimedBy = agentId;
  return waypoint;
};

export const distanceBetweenTiles = (from: TilePoint, to: TilePoint) => Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

export const pickNearestAvailableWaypoint = (
  candidates: WaypointClaim[],
  origin: TilePoint,
  agentId: string,
  /** Set of waypoint IDs already targeted by other walking agents — exclude them */
  excludeIds?: Set<string>,
): WaypointClaim | null => {
  const available = candidates.filter(
    (waypoint) =>
      (!waypoint.claimedBy || waypoint.claimedBy === agentId) &&
      !(excludeIds?.has(waypoint.id)),
  );
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
