import type { CollisionMapData } from '@/lib/collisionMap';

export interface PathNode {
  x: number;
  y: number;
}

interface OpenNode extends PathNode {
  g: number;
  h: number;
  f: number;
  key: string;
}

const DIRECTIONS: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

const getKey = (x: number, y: number) => `${x},${y}`;
const heuristic = (from: PathNode, to: PathNode) => Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

export const isWalkableTile = (collisionMap: CollisionMapData, x: number, y: number) => Boolean(collisionMap.cells[y]?.[x]?.walkable);

export const findPath = (
  start: PathNode,
  goal: PathNode,
  collisionMap: CollisionMapData,
  noGoTiles: Set<string> = new Set(),
): PathNode[] => {
  if (!isWalkableTile(collisionMap, start.x, start.y) || !isWalkableTile(collisionMap, goal.x, goal.y)) {
    return [];
  }

  if (start.x === goal.x && start.y === goal.y) {
    return [start];
  }

  const startKey = getKey(start.x, start.y);
  const open = new Map<string, OpenNode>([
    [startKey, { ...start, g: 0, h: heuristic(start, goal), f: heuristic(start, goal), key: startKey }],
  ]);
  const closed = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScores = new Map<string, number>([[startKey, 0]]);

  while (open.size > 0) {
    const current = [...open.values()].sort((left, right) => left.f - right.f || left.h - right.h)[0];
    open.delete(current.key);

    if (current.x === goal.x && current.y === goal.y) {
      const path: PathNode[] = [{ x: current.x, y: current.y }];
      let cursor = current.key;

      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        const [x, y] = cursor.split(',').map(Number);
        path.push({ x, y });
      }

      return path.reverse();
    }

    closed.add(current.key);

    for (const [dx, dy] of DIRECTIONS) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      const nextKey = getKey(nextX, nextY);

      if (closed.has(nextKey) || !isWalkableTile(collisionMap, nextX, nextY)) {
        continue;
      }

      if (noGoTiles.has(nextKey) && !(nextX === goal.x && nextY === goal.y)) {
        continue;
      }

      const tentativeG = current.g + 1;
      const bestKnownG = gScores.get(nextKey);
      if (typeof bestKnownG === 'number' && tentativeG >= bestKnownG) {
        continue;
      }

      cameFrom.set(nextKey, current.key);
      gScores.set(nextKey, tentativeG);
      const h = heuristic({ x: nextX, y: nextY }, goal);
      open.set(nextKey, { x: nextX, y: nextY, g: tentativeG, h, f: tentativeG + h, key: nextKey });
    }
  }

  return [];
};
