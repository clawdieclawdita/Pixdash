import type { Direction } from '@pixdash/shared';

export type BackendWaypointType = 'desk' | 'reception' | 'restroom' | 'conference' | 'dining';

export interface BackendWaypoint {
  id: string;
  x: number;
  y: number;
  type: BackendWaypointType;
  direction: Direction;
  visualOffsetX?: number;
  visualOffsetY?: number;
  claimedBy?: string | null;
  reservedFor?: string | null;
}

const TILE = 32;

const createWaypoint = (
  id: string,
  x: number,
  y: number,
  type: BackendWaypointType,
  direction: Direction,
  visualOffsetX = 0,
  visualOffsetY = 0,
  reservedFor: string | null = null,
): BackendWaypoint => ({
  id,
  x,
  y,
  type,
  direction,
  visualOffsetX,
  visualOffsetY,
  claimedBy: null,
  reservedFor,
});

const seated = (
  id: string,
  x: number,
  y: number,
  type: BackendWaypointType,
  direction: Direction,
  visualOffsetX?: number,
  visualOffsetY?: number,
  reservedFor: string | null = null,
): BackendWaypoint => {
  const offsets: Record<Direction, [number, number]> = {
    north: [0, -TILE],
    south: [0, TILE],
    east: [TILE, 0],
    west: [-TILE, 0],
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
    reservedFor,
  );
};

export const BACKEND_WAYPOINTS: BackendWaypoint[] = [
  seated('desk-a1', 6, 18, 'desk', 'east', 11, 30),
  seated('desk-a2', 15, 18, 'desk', 'west', 1, 33),
  seated('desk-a3', 7, 24, 'desk', 'east', -21, -22),
  seated('desk-a4', 16, 25, 'desk', 'west', -35, -11),
  seated('desk-b1', 23, 18, 'desk', 'east', 1, 31),
  seated('desk-b2', 31, 18, 'desk', 'west', 12, 34),
  seated('desk-b3', 22, 25, 'desk', 'east', 33, -10),
  seated('desk-b4', 31, 26, 'desk', 'west', 13, -46),
  seated('desk-c1', 38, 18, 'desk', 'east', 12, 33),
  seated('desk-c2', 47, 18, 'desk', 'west', -9, 31),
  seated('desk-c3', 37, 25, 'desk', 'east', 44, -12),
  seated('desk-c4', 46, 24, 'desk', 'west', 23, 21),
  seated('desk-d1', 26, 34, 'desk', 'south', -43, 19),
  seated('desk-d2', 29, 34, 'desk', 'south', 43, 19),
  seated('desk-d3', 41, 34, 'desk', 'south', -40, 19),
  seated('desk-d4', 44, 34, 'desk', 'south', 46, 19),
  seated('desk-e1', 25, 42, 'desk', 'north', -11, -41),
  seated('desk-e2', 30, 42, 'desk', 'north', 11, -41),
  seated('desk-e3', 41, 41, 'desk', 'north', -40, -9),
  seated('desk-e4', 45, 42, 'desk', 'north', 14, -41),
  seated('desk-f1', 26, 46, 'desk', 'south', -43, -5),
  seated('desk-f2', 29, 46, 'desk', 'south', 43, -5),
  seated('desk-f3', 41, 46, 'desk', 'south', -40, -5),
  seated('desk-f4', 44, 46, 'desk', 'south', 45, -5),
  seated('desk-g1', 25, 53, 'desk', 'north', -11, -33),
  seated('desk-g2', 29, 52, 'desk', 'north', 43, -1),
  seated('desk-g3', 41, 52, 'desk', 'north', -40, -1),
  seated('desk-g4', 44, 52, 'desk', 'north', 46, -1),
  seated('reception-clawdie', 7, 37, 'reception', 'south', 0, 32, 'main'),
  seated('reception-1', 4, 42, 'reception', 'south'),
  seated('reception-2', 7, 42, 'reception', 'north'),
  seated('reception-3', 10, 42, 'reception', 'north'),
  seated('reception-4', 0, 50, 'reception', 'east'),
  seated('reception-5', 5, 53, 'reception', 'north'),
  seated('reception-6', 7, 53, 'reception', 'north'),
  seated('reception-7', 8, 54, 'reception', 'north'),
  seated('rest-1', 53, 47, 'restroom', 'west', 64, 0),
  seated('rest-2', 53, 48, 'restroom', 'west', 64, 0),
  seated('rest-3', 53, 51, 'restroom', 'west', 64, 0),
  seated('rest-4', 53, 52, 'restroom', 'west', 64, 0),
  seated('rest-5', 65, 47, 'restroom', 'east', 64, 0),
  seated('rest-6', 65, 48, 'restroom', 'east', 64, 0),
  seated('rest-7', 65, 51, 'restroom', 'east', 64, 0),
  seated('rest-8', 65, 52, 'restroom', 'east', 64, 0),
  seated('conf-head-n', 63, 9, 'conference', 'south', 0, 30),
  seated('conf-head-s', 63, 28, 'conference', 'north', 0, -30),
  seated('conf-left-1', 56, 9, 'conference', 'east', 33, 0),
  seated('conf-left-2', 56, 13, 'conference', 'east', 33, 0),
  seated('conf-left-3', 56, 17, 'conference', 'east', 33, 0),
  seated('conf-left-4', 56, 21, 'conference', 'east', 33, 0),
  seated('conf-left-5', 56, 25, 'conference', 'east', 33, 0),
  seated('conf-right-1', 72, 9, 'conference', 'west', -33, 0),
  seated('conf-right-2', 72, 13, 'conference', 'west', -33, 0),
  seated('conf-right-3', 72, 17, 'conference', 'west', -33, 0),
  seated('conf-right-4', 72, 21, 'conference', 'west', -33, 0),
  seated('conf-right-5', 72, 25, 'conference', 'west', -33, 0),
  createWaypoint('dining-center', 60, 46, 'dining', 'east', 64, 0),
];

export const cloneBackendWaypoints = (): BackendWaypoint[] => BACKEND_WAYPOINTS.map((waypoint) => ({ ...waypoint }));
