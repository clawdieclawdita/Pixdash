import type { Direction } from '@pixdash/shared';
import type { MovementState } from '@/types';

export const TILE_SIZE = 32;
export const WALK_SPEED_PX_PER_SECOND = 131;
export const WALK_FRAME_MS = 180;
const WALK_FRAME_SEQUENCE = [1, 2] as const;

export interface TilePoint {
  x: number;
  y: number;
}

export const tileToPixelCenter = (tile: TilePoint) => ({
  x: tile.x * TILE_SIZE + TILE_SIZE / 2,
  y: tile.y * TILE_SIZE + TILE_SIZE / 2,
});

export const pixelToTile = (x: number, y: number): TilePoint => ({
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
      return 'seated-idle';
  }
};
