import type { Direction } from '@pixdash/shared';
import type { AgentPosition, MovementState } from '@/types';
import type { PathNode } from '@/lib/pathfinding';
import { isWalkableTile } from '@/lib/pathfinding';
import type { CollisionMapData } from '@/lib/collisionMap';

export const TILE_SIZE = 32;
export const WALK_SPEED_PX_PER_SECOND = 131;
export const WALK_FRAME_MS = 180;
const WALK_FRAME_SEQUENCE = [1, 2] as const;

export const tileToPixelCenter = (tile: PathNode) => ({
  x: tile.x * TILE_SIZE + TILE_SIZE / 2,
  y: tile.y * TILE_SIZE + TILE_SIZE / 2,
});

export const pixelToTile = (x: number, y: number): PathNode => ({
  x: Math.max(0, Math.floor(x / TILE_SIZE)),
  y: Math.max(0, Math.floor(y / TILE_SIZE)),
});

export const getWalkFrameIndex = (moving: boolean, now = performance.now()) => {
  if (!moving) {
    return 0;
  }

  const sequenceIndex = Math.floor(now / WALK_FRAME_MS) % WALK_FRAME_SEQUENCE.length;
  return WALK_FRAME_SEQUENCE[sequenceIndex];
};

export const getDirectionFromDelta = (deltaX: number, deltaY: number, fallback: Direction = 'south'): Direction => {
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX >= 0 ? 'east' : 'west';
  }

  if (Math.abs(deltaY) > 0) {
    return deltaY >= 0 ? 'south' : 'north';
  }

  return fallback;
};

export const getArrivalStateForMovementType = (type: 'desk' | 'restroom' | 'reception' | 'conference' | 'watercooler' | 'dining'): MovementState => {
  switch (type) {
    case 'desk':
      return 'seated-working';
    case 'restroom':
      return 'seated-idle';
    case 'reception':
      return 'seated-idle';
    case 'conference':
      return 'seated-conference';
    case 'watercooler':
      return 'at-watercooler';
    case 'dining':
      return 'standing';
  }
};

export const findNearestWalkableTile = (
  collisionMap: CollisionMapData,
  start: PathNode,
  noGoTiles?: Set<string>,
  maxRadius = 10,
): PathNode | null => {
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = start.x + dx;
        const y = start.y + dy;
        const key = `${x},${y}`;

        if (isWalkableTile(collisionMap, x, y) && !(noGoTiles?.has(key))) {
          return { x, y };
        }
      }
    }
  }

  return null;
};

export const advanceAgentAlongPath = (agent: AgentPosition, deltaMs: number): AgentPosition => {
  const path = agent.path ?? [];
  if (agent.movementState !== 'walking' || path.length === 0) {
    return agent;
  }

  const speedPerMs = WALK_SPEED_PX_PER_SECOND / 1000;
  let remainingDistance = Math.max(0, deltaMs) * speedPerMs;
  let currentX = agent.x;
  let currentY = agent.y;
  let direction = agent.direction ?? 'south';
  let nextPath = [...path];

  while (remainingDistance > 0 && nextPath.length > 0) {
    const nextTile = nextPath[0];
    const target = tileToPixelCenter(nextTile);
    const deltaX = target.x - currentX;
    const deltaY = target.y - currentY;

    if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) {
      currentX = target.x;
      currentY = target.y;
      nextPath.shift();
      continue;
    }

    const isHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);
    direction = getDirectionFromDelta(deltaX, deltaY, direction);

    if (isHorizontal && Math.abs(deltaY) > 0.001) {
      currentY = target.y;
      continue;
    }

    if (!isHorizontal && Math.abs(deltaX) > 0.001) {
      currentX = target.x;
      continue;
    }

    const axisDelta = isHorizontal ? deltaX : deltaY;
    const axisDistance = Math.abs(axisDelta);

    if (axisDistance < 0.001) {
      if (isHorizontal) {
        currentX = target.x;
      } else {
        currentY = target.y;
      }
      nextPath.shift();
      continue;
    }

    const step = Math.min(remainingDistance, axisDistance);
    if (isHorizontal) {
      currentX += Math.sign(axisDelta) * step;
      currentY = target.y;
    } else {
      currentY += Math.sign(axisDelta) * step;
      currentX = target.x;
    }
    remainingDistance -= step;

    if (step >= axisDistance - 0.001) {
      currentX = target.x;
      currentY = target.y;
      nextPath.shift();
    }
  }

  return {
    ...agent,
    x: currentX,
    y: currentY,
    direction,
    path: nextPath,
    targetX: nextPath[0] ? tileToPixelCenter(nextPath[0]).x : agent.targetX,
    targetY: nextPath[0] ? tileToPixelCenter(nextPath[0]).y : agent.targetY,
  };
};
