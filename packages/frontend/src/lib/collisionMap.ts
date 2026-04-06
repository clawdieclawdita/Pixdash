import blockedMapUrl from '@assets/sprites/blocked.png';
import { OFFICE_HEIGHT, OFFICE_WIDTH } from '@/lib/officeScene';

export interface CollisionCell {
  gridX: number;
  gridY: number;
  centerX: number;
  centerY: number;
  walkable: boolean;
  walkableRatio: number;
}

export interface CollisionMapData {
  imageWidth: number;
  imageHeight: number;
  cellSize: number;
  cols: number;
  rows: number;
  cells: CollisionCell[][];
  walkableCells: CollisionCell[];
}

const DEFAULT_CELL_SIZE = 32;
const BLACK_THRESHOLD = 32;
const WALKABLE_RATIO_THRESHOLD = 0.5;

let collisionMapPromise: Promise<CollisionMapData> | null = null;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load collision map: ${src}`));
    image.src = src;
  });

const isBlockedPixel = (red: number, green: number, blue: number) =>
  red <= BLACK_THRESHOLD && green <= BLACK_THRESHOLD && blue <= BLACK_THRESHOLD;

const buildCollisionMap = async (cellSize = DEFAULT_CELL_SIZE): Promise<CollisionMapData> => {
  const image = await loadImage(blockedMapUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Unable to create collision map canvas context.');
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);

  const cols = Math.floor(image.width / cellSize);
  const rows = Math.floor(image.height / cellSize);
  const cells: CollisionCell[][] = [];
  const walkableCells: CollisionCell[] = [];

  for (let gridY = 0; gridY < rows; gridY += 1) {
    const row: CollisionCell[] = [];

    for (let gridX = 0; gridX < cols; gridX += 1) {
      const sampleWidth = Math.min(cellSize, image.width - gridX * cellSize);
      const sampleHeight = Math.min(cellSize, image.height - gridY * cellSize);
      const imageData = context.getImageData(gridX * cellSize, gridY * cellSize, sampleWidth, sampleHeight);
      let walkablePixels = 0;

      for (let index = 0; index < imageData.data.length; index += 4) {
        if (!isBlockedPixel(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2])) {
          walkablePixels += 1;
        }
      }

      const totalPixels = Math.max(1, sampleWidth * sampleHeight);
      const walkableRatio = walkablePixels / totalPixels;
      const cell: CollisionCell = {
        gridX,
        gridY,
        centerX: gridX * cellSize + sampleWidth / 2,
        centerY: gridY * cellSize + sampleHeight / 2,
        walkable: walkableRatio > WALKABLE_RATIO_THRESHOLD,
        walkableRatio
      };

      row.push(cell);
      if (cell.walkable) {
        walkableCells.push(cell);
      }
    }

    cells.push(row);
  }

  return {
    imageWidth: image.width,
    imageHeight: image.height,
    cellSize,
    cols,
    rows,
    cells,
    walkableCells
  };
};

export const loadCollisionMap = (cellSize = DEFAULT_CELL_SIZE) => {
  if (!collisionMapPromise) {
    collisionMapPromise = buildCollisionMap(cellSize);
  }

  return collisionMapPromise;
};

const getCell = (map: CollisionMapData, gridX: number, gridY: number) => map.cells[gridY]?.[gridX] ?? null;

const getLocalClearance = (map: CollisionMapData, gridX: number, gridY: number, radius: number) => {
  let walkableCount = 0;

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (getCell(map, gridX + offsetX, gridY + offsetY)?.walkable) {
        walkableCount += 1;
      }
    }
  }

  return walkableCount;
};

interface Placement {
  x: number;
  y: number;
}

export const pickDeskPositions = (map: CollisionMapData, count: number): Placement[] => {
  const candidates = map.walkableCells
    .map((cell) => {
      const edgeMargin = Math.min(cell.centerX, cell.centerY, OFFICE_WIDTH - cell.centerX, OFFICE_HEIGHT - cell.centerY);
      return {
        cell,
        score:
          getLocalClearance(map, cell.gridX, cell.gridY, 2) * 20 +
          getLocalClearance(map, cell.gridX, cell.gridY, 3) * 8 -
          Math.abs(cell.centerY - OFFICE_HEIGHT * 0.58) / 10 -
          Math.abs(cell.centerX - OFFICE_WIDTH * 0.5) / 18 +
          edgeMargin / 6
      };
    })
    .filter(({ cell }) => cell.centerX > 120 && cell.centerX < OFFICE_WIDTH - 120 && cell.centerY > 120 && cell.centerY < OFFICE_HEIGHT - 120)
    .sort((left, right) => right.score - left.score);

  const selected: Placement[] = [];
  const minDistance = 260;

  for (const candidate of candidates) {
    const position = { x: Math.round(candidate.cell.centerX), y: Math.round(candidate.cell.centerY) };
    const tooClose = selected.some((existing) => Math.hypot(existing.x - position.x, existing.y - position.y) < minDistance);

    if (tooClose) {
      continue;
    }

    selected.push(position);
    if (selected.length >= count) {
      break;
    }
  }

  if (selected.length < count) {
    for (const candidate of candidates) {
      const position = { x: Math.round(candidate.cell.centerX), y: Math.round(candidate.cell.centerY) };
      const duplicate = selected.some((existing) => existing.x === position.x && existing.y === position.y);

      if (!duplicate) {
        selected.push(position);
      }

      if (selected.length >= count) {
        break;
      }
    }
  }

  return selected.slice(0, count);
};
