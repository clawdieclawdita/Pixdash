import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Tilemap } from '@pixdash/shared';

const GRID_WIDTH = 75;
const GRID_HEIGHT = 56;
const TILE_SIZE = 32;
const BRIGHTNESS_THRESHOLD = 50;
const WALKABLE_RATIO_THRESHOLD = 0.5;

const DEFAULT_SPAWN_POINTS = [
  { x: 3, y: 22 }, { x: 6, y: 22 }, { x: 16, y: 22 }, { x: 20, y: 21 },
  { x: 23, y: 22 }, { x: 31, y: 22 }, { x: 35, y: 22 }, { x: 48, y: 22 },
  { x: 52, y: 22 }, { x: 57, y: 22 }, { x: 69, y: 22 }, { x: 72, y: 22 },
  { x: 3, y: 21 }, { x: 18, y: 21 }, { x: 32, y: 21 }, { x: 38, y: 21 },
];

export async function generateCollisionGridFromBlockedPng(blockedPngPath: string): Promise<boolean[][]> {
  const { data, info } = await sharp(blockedPngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== GRID_WIDTH * TILE_SIZE || info.height !== GRID_HEIGHT * TILE_SIZE) {
    throw new Error(`Unexpected blocked.png dimensions ${info.width}x${info.height}; expected ${GRID_WIDTH * TILE_SIZE}x${GRID_HEIGHT * TILE_SIZE}`);
  }

  const walkable = Array.from({ length: GRID_HEIGHT }, () => Array.from({ length: GRID_WIDTH }, () => false));

  for (let tileY = 0; tileY < GRID_HEIGHT; tileY += 1) {
    for (let tileX = 0; tileX < GRID_WIDTH; tileX += 1) {
      let brightPixels = 0;
      for (let py = 0; py < TILE_SIZE; py += 1) {
        for (let px = 0; px < TILE_SIZE; px += 1) {
          const imageX = tileX * TILE_SIZE + px;
          const imageY = tileY * TILE_SIZE + py;
          const index = (imageY * info.width + imageX) * info.channels;
          const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
          if (brightness > BRIGHTNESS_THRESHOLD) {
            brightPixels += 1;
          }
        }
      }
      walkable[tileY][tileX] = brightPixels / (TILE_SIZE * TILE_SIZE) > WALKABLE_RATIO_THRESHOLD;
    }
  }

  return walkable;
}

export async function loadOfficeLayoutWithCollisionGrid(layoutPath: string): Promise<Tilemap> {
  const layoutDir = path.dirname(layoutPath);
  const blockedPngPath = resolveBlockedPngPath(layoutDir);
  const collisionGridPath = path.join(layoutDir, 'collision-grid.json');

  const baseLayout = existsSync(layoutPath)
    ? (JSON.parse(readFileSync(layoutPath, 'utf8')) as Tilemap)
    : undefined;

  const walkable = existsSync(collisionGridPath)
    ? (JSON.parse(readFileSync(collisionGridPath, 'utf8')) as boolean[][])
    : await generateAndCacheCollisionGrid(blockedPngPath, collisionGridPath);

  return {
    version: baseLayout?.version ?? 1,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    tileSize: TILE_SIZE,
    layers: {
      floor: normalizeLayer(baseLayout?.layers?.floor, GRID_WIDTH, GRID_HEIGHT, 1),
      furniture: normalizeLayer(baseLayout?.layers?.furniture, GRID_WIDTH, GRID_HEIGHT, 0),
      walls: normalizeLayer(baseLayout?.layers?.walls, GRID_WIDTH, GRID_HEIGHT, 0),
    },
    spawnPoints: DEFAULT_SPAWN_POINTS,
    walkable,
  };
}

async function generateAndCacheCollisionGrid(blockedPngPath: string, collisionGridPath: string): Promise<boolean[][]> {
  const walkable = await generateCollisionGridFromBlockedPng(blockedPngPath);
  writeFileSync(collisionGridPath, JSON.stringify(walkable));
  return walkable;
}

function normalizeLayer(layer: number[][] | undefined, width: number, height: number, fallbackValue: number): number[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => layer?.[y]?.[x] ?? fallbackValue),
  );
}

function resolveBlockedPngPath(layoutDir: string): string {
  const directPath = path.join(layoutDir, 'blocked.png');
  if (existsSync(directPath)) {
    return directPath;
  }

  const spritePath = path.join(layoutDir, 'sprites', 'blocked.png');
  if (existsSync(spritePath)) {
    return spritePath;
  }

  throw new Error(`blocked.png not found beside office layout in ${layoutDir}`);
}
