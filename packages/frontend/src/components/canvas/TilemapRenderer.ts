import type { AgentPosition, TilemapData } from '@/types';

const BASE_TILE = 16;
const SCALE = 2;
const TILE = BASE_TILE * SCALE;

type Palette = {
  woodLight: string;
  woodMid: string;
  woodDark: string;
  stoneLight: string;
  stoneMid: string;
  stoneDark: string;
  carpet: string;
  carpetShadow: string;
  plant: string;
  leafDark: string;
  wall: string;
  wallShadow: string;
  metal: string;
  accent: string;
  paper: string;
  coffee: string;
};

const drawPx = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
};

const palette: Palette = {
  woodLight: '#b98b58',
  woodMid: '#8b6137',
  woodDark: '#5e3e23',
  stoneLight: '#c6c2bb',
  stoneMid: '#9b958b',
  stoneDark: '#68635c',
  carpet: '#4e6679',
  carpetShadow: '#364858',
  plant: '#7aa35d',
  leafDark: '#48663b',
  wall: '#d7c9ad',
  wallShadow: '#b19674',
  metal: '#7a8897',
  accent: '#d96c3f',
  paper: '#efe4cf',
  coffee: '#6b4228'
};

const tileCache = new Map<number, HTMLCanvasElement>();

const createTileCanvas = (tileId: number) => {
  const cached = tileCache.get(tileId);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create tile canvas context.');
  }

  ctx.imageSmoothingEnabled = false;

  const frameFloorWood = () => {
    drawPx(ctx, palette.woodMid, 0, 0, 16, 16);
    [1, 5, 9, 13].forEach((y) => drawPx(ctx, palette.woodDark, 0, y, 16, 1));
    [2, 6, 10, 14].forEach((x) => drawPx(ctx, palette.woodLight, x, 0, 1, 16));
  };

  const frameFloorTile = () => {
    drawPx(ctx, palette.stoneLight, 0, 0, 16, 16);
    [0, 4, 8, 12].forEach((line) => {
      drawPx(ctx, palette.stoneMid, line, 0, 1, 16);
      drawPx(ctx, palette.stoneMid, 0, line, 16, 1);
    });
    drawPx(ctx, palette.stoneDark, 15, 0, 1, 16);
    drawPx(ctx, palette.stoneDark, 0, 15, 16, 1);
  };

  const frameCarpet = () => {
    drawPx(ctx, palette.carpet, 0, 0, 16, 16);
    for (let y = 1; y < 16; y += 2) {
      drawPx(ctx, palette.carpetShadow, 0, y, 16, 1);
    }
    drawPx(ctx, palette.paper, 1, 1, 14, 1);
    drawPx(ctx, palette.paper, 1, 14, 14, 1);
  };

  const frameConcrete = () => {
    drawPx(ctx, palette.stoneMid, 0, 0, 16, 16);
    drawPx(ctx, palette.stoneDark, 2, 3, 2, 2);
    drawPx(ctx, palette.stoneLight, 10, 4, 2, 2);
    drawPx(ctx, palette.stoneDark, 6, 10, 3, 2);
    drawPx(ctx, palette.stoneLight, 12, 12, 2, 2);
  };

  const frameDesk = (metal = false) => {
    drawPx(ctx, metal ? palette.metal : palette.woodDark, 2, 4, 12, 7);
    drawPx(ctx, metal ? palette.stoneLight : palette.woodLight, 2, 4, 12, 1);
    drawPx(ctx, metal ? palette.stoneDark : palette.woodDark, 3, 11, 2, 4);
    drawPx(ctx, metal ? palette.stoneDark : palette.woodDark, 11, 11, 2, 4);
    drawPx(ctx, palette.paper, 4, 6, 5, 3);
    drawPx(ctx, palette.accent, 10, 6, 2, 2);
  };

  const frameChair = (metal = false) => {
    drawPx(ctx, metal ? palette.metal : palette.woodDark, 5, 3, 6, 4);
    drawPx(ctx, metal ? palette.stoneLight : palette.woodLight, 5, 7, 6, 4);
    drawPx(ctx, metal ? palette.stoneDark : palette.woodDark, 6, 11, 1, 4);
    drawPx(ctx, metal ? palette.stoneDark : palette.woodDark, 9, 11, 1, 4);
  };

  const framePlant = (large = false) => {
    drawPx(ctx, palette.coffee, 6, 11, 4, 3);
    drawPx(ctx, palette.woodLight, 5, 10, 6, 1);
    drawPx(ctx, palette.plant, 6, large ? 2 : 5, 4, large ? 8 : 5);
    drawPx(ctx, palette.leafDark, 4, large ? 5 : 7, 2, 3);
    drawPx(ctx, palette.leafDark, 10, large ? 4 : 7, 2, 3);
    if (large) {
      drawPx(ctx, palette.plant, 3, 5, 2, 4);
      drawPx(ctx, palette.plant, 11, 5, 2, 4);
    }
  };

  const frameBookshelf = () => {
    drawPx(ctx, palette.woodDark, 2, 2, 12, 12);
    [4, 8, 12].forEach((y) => drawPx(ctx, palette.woodLight, 3, y, 10, 1));
    drawPx(ctx, palette.accent, 4, 3, 2, 1);
    drawPx(ctx, '#6d8f63', 7, 3, 2, 1);
    drawPx(ctx, '#8b6fb1', 10, 3, 2, 1);
    drawPx(ctx, '#cf9650', 5, 7, 2, 1);
    drawPx(ctx, '#4d7ea8', 8, 7, 2, 1);
    drawPx(ctx, '#c9b064', 6, 11, 2, 1);
  };

  const frameCooler = () => {
    drawPx(ctx, palette.stoneLight, 4, 4, 8, 10);
    drawPx(ctx, palette.metal, 5, 5, 6, 8);
    drawPx(ctx, '#9fd1f2', 5, 2, 6, 4);
    drawPx(ctx, palette.accent, 6, 8, 1, 1);
    drawPx(ctx, '#6aa0d8', 9, 8, 1, 1);
  };

  const frameCoffee = () => {
    drawPx(ctx, palette.metal, 3, 6, 10, 7);
    drawPx(ctx, palette.stoneDark, 5, 4, 6, 3);
    drawPx(ctx, palette.accent, 4, 8, 2, 1);
    drawPx(ctx, palette.paper, 8, 9, 3, 2);
  };

  const frameWall = (variant: number) => {
    drawPx(ctx, palette.wall, 0, 0, 16, 16);
    drawPx(ctx, palette.wallShadow, 0, 12, 16, 4);
    drawPx(ctx, palette.paper, 1, 1, 14, 1);

    if (variant === 10 || variant === 11) {
      drawPx(ctx, palette.wallShadow, 0, 11, 16, 1);
    }
    if (variant === 12 || variant === 14 || variant === 16) {
      drawPx(ctx, palette.wallShadow, 0, 0, 2, 16);
    }
    if (variant === 13 || variant === 15 || variant === 17) {
      drawPx(ctx, palette.wallShadow, 14, 0, 2, 16);
    }
    if (variant === 18 || variant === 19) {
      drawPx(ctx, palette.woodDark, 5, 5, 6, 10);
      drawPx(ctx, palette.woodLight, 5, 5, 6, 1);
      drawPx(ctx, palette.accent, 9, 10, 1, 1);
    }
  };

  switch (tileId) {
    case 0: frameFloorWood(); break;
    case 1: frameFloorTile(); break;
    case 2: frameCarpet(); break;
    case 3: frameConcrete(); break;
    case 20: frameDesk(false); break;
    case 21: frameDesk(true); break;
    case 22: frameChair(false); break;
    case 23: frameChair(true); break;
    case 24: framePlant(false); break;
    case 25: framePlant(true); break;
    case 26: frameBookshelf(); break;
    case 27: frameCooler(); break;
    case 28: frameCoffee(); break;
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
    case 15:
    case 16:
    case 17:
    case 18:
    case 19:
      frameWall(tileId);
      break;
    default:
      drawPx(ctx, 'rgba(0,0,0,0)', 0, 0, 16, 16);
  }

  tileCache.set(tileId, canvas);
  return canvas;
};

export class TilemapRenderer {
  renderFrame(ctx: CanvasRenderingContext2D, tilemap: TilemapData, agents: AgentPosition[], renderAgents: () => void) {
    this.renderFloor(ctx, tilemap);
    this.renderFurnitureRowsSplit(ctx, tilemap, agents, false);
    renderAgents();
    this.renderFurnitureRowsSplit(ctx, tilemap, agents, true);
    this.renderWalls(ctx, tilemap);
  }

  renderFloor(ctx: CanvasRenderingContext2D, tilemap: TilemapData) {
    tilemap.layers.floor.forEach((row: number[], y: number) => {
      row.forEach((tileId: number, x: number) => {
        ctx.drawImage(createTileCanvas(tileId), x * TILE, y * TILE);
      });
    });
  }

  renderFurnitureRowsSplit(ctx: CanvasRenderingContext2D, tilemap: TilemapData, agents: AgentPosition[], frontPass: boolean) {
    const boundary = agents.length > 0 ? Math.floor(Math.min(...agents.map((agent) => agent.y))) : tilemap.height;
    for (let row = 0; row < tilemap.height; row += 1) {
      const isFrontRow = row >= boundary;
      if (isFrontRow === frontPass) {
        this.renderFurnitureRow(ctx, tilemap, row, frontPass);
      }
    }
  }

  renderFurnitureRow(ctx: CanvasRenderingContext2D, tilemap: TilemapData, rowIndex: number, frontPass: boolean) {
    const row = tilemap.layers.furniture[rowIndex];
    row.forEach((tileId: number, x: number) => {
      if (tileId === 0) return;
      const isHighObject = tileId === 22 || tileId === 23;
      if ((frontPass && !isHighObject) || (!frontPass && isHighObject)) {
        return;
      }
      ctx.drawImage(createTileCanvas(tileId), x * TILE, rowIndex * TILE);
    });
  }

  renderWalls(ctx: CanvasRenderingContext2D, tilemap: TilemapData) {
    tilemap.layers.walls.forEach((row: number[], y: number) => {
      row.forEach((tileId: number, x: number) => {
        if (tileId === 0) return;
        ctx.drawImage(createTileCanvas(tileId), x * TILE, y * TILE);
      });
    });
  }
}
