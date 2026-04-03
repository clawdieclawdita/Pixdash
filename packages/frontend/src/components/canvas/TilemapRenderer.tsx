import type { AgentPosition, TilemapData } from '@/types';

const TILE_SIZE = 32;
const EMPTY_TILE = 0;

type Palette = {
  base: string;
  light: string;
  dark: string;
  accent?: string;
  accent2?: string;
};

export class TilemapRenderer {
  constructor() {}

  renderFrame(
    ctx: CanvasRenderingContext2D,
    tilemap: TilemapData,
    agents: AgentPosition[],
    renderAgents: () => void,
  ) {
    const minAgentY = agents.length > 0 ? Math.min(...agents.map((agent) => agent.y)) : Number.POSITIVE_INFINITY;

    this.renderLayer(ctx, tilemap.layers.floor, (tile, x, y) => this.drawFloorTile(ctx, tile, x, y));
    this.renderFurnitureRange(ctx, tilemap.layers.furniture, 0, Math.max(-1, minAgentY - 1));
    renderAgents();
    this.renderFurnitureRange(ctx, tilemap.layers.furniture, Number.isFinite(minAgentY) ? minAgentY : 0, tilemap.height - 1);
    this.renderLayer(ctx, tilemap.layers.walls, (tile, x, y) => this.drawWallTile(ctx, tile, x, y));
  }

  private renderLayer(
    ctx: CanvasRenderingContext2D,
    layer: number[][],
    drawTile: (tile: number, tileX: number, tileY: number) => void,
  ) {
    layer.forEach((row, tileY) => {
      row.forEach((tile, tileX) => {
        drawTile(tile, tileX, tileY);
      });
    });
  }

  private renderFurnitureRange(ctx: CanvasRenderingContext2D, layer: number[][], startY: number, endY: number) {
    if (endY < startY) return;

    for (let tileY = Math.max(0, startY); tileY <= Math.min(layer.length - 1, endY); tileY += 1) {
      const row = layer[tileY];
      row.forEach((tile, tileX) => this.drawFurnitureTile(ctx, tile, tileX, tileY));
    }
  }

  private drawFloorTile(ctx: CanvasRenderingContext2D, tile: number, tileX: number, tileY: number) {
    const x = tileX * TILE_SIZE;
    const y = tileY * TILE_SIZE;

    switch (tile) {
      case 0:
        this.drawWoodFloor(ctx, x, y);
        break;
      case 1:
        this.drawGrayTileFloor(ctx, x, y);
        break;
      case 2:
        this.drawCarpetFloor(ctx, x, y);
        break;
      case 3:
        this.drawConcreteFloor(ctx, x, y);
        break;
      default:
        this.drawConcreteFloor(ctx, x, y);
        break;
    }
  }

  private drawWallTile(ctx: CanvasRenderingContext2D, tile: number, tileX: number, tileY: number) {
    if (tile === EMPTY_TILE) return;

    const x = tileX * TILE_SIZE;
    const y = tileY * TILE_SIZE;
    const palette: Palette = {
      base: '#8b8f99',
      light: '#b5bac4',
      dark: '#5f646d',
      accent: '#3e4248',
      accent2: '#d7dce4',
    };

    this.fillTile(ctx, x, y, palette.base);
    this.drawFrame(ctx, x, y, palette.light, palette.dark);

    switch (tile) {
      case 10:
        this.drawNorthWall(ctx, x, y, palette);
        break;
      case 11:
        this.drawSouthWall(ctx, x, y, palette);
        break;
      case 12:
        this.drawWestWall(ctx, x, y, palette);
        break;
      case 13:
        this.drawEastWall(ctx, x, y, palette);
        break;
      case 14:
        this.drawNorthWall(ctx, x, y, palette);
        this.drawWestWall(ctx, x, y, palette);
        this.drawCornerHighlight(ctx, x, y, 'nw', palette);
        break;
      case 15:
        this.drawNorthWall(ctx, x, y, palette);
        this.drawEastWall(ctx, x, y, palette);
        this.drawCornerHighlight(ctx, x, y, 'ne', palette);
        break;
      case 16:
        this.drawSouthWall(ctx, x, y, palette);
        this.drawWestWall(ctx, x, y, palette);
        this.drawCornerHighlight(ctx, x, y, 'sw', palette);
        break;
      case 17:
        this.drawSouthWall(ctx, x, y, palette);
        this.drawEastWall(ctx, x, y, palette);
        this.drawCornerHighlight(ctx, x, y, 'se', palette);
        break;
      case 18:
        this.drawDoorVertical(ctx, x, y, palette);
        break;
      case 19:
        this.drawDoorHorizontal(ctx, x, y, palette);
        break;
      default:
        this.drawNorthWall(ctx, x, y, palette);
        break;
    }
  }

  private drawFurnitureTile(ctx: CanvasRenderingContext2D, tile: number, tileX: number, tileY: number) {
    if (tile === EMPTY_TILE) return;

    const x = tileX * TILE_SIZE;
    const y = tileY * TILE_SIZE;

    switch (tile) {
      case 20:
        this.drawDeskWood(ctx, x, y);
        break;
      case 21:
        this.drawDeskMetal(ctx, x, y);
        break;
      case 22:
        this.drawChairWood(ctx, x, y);
        break;
      case 23:
        this.drawChairMetal(ctx, x, y);
        break;
      case 24:
        this.drawPlantSmall(ctx, x, y);
        break;
      case 25:
        this.drawPlantLarge(ctx, x, y);
        break;
      case 26:
        this.drawBookshelf(ctx, x, y);
        break;
      case 27:
        this.drawWaterCooler(ctx, x, y);
        break;
      case 28:
        this.drawCoffeeMachine(ctx, x, y);
        break;
      default:
        break;
    }
  }

  private drawWoodFloor(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.fillTile(ctx, x, y, '#9f6d42');
    for (let py = 0; py < TILE_SIZE; py += 1) {
      const tone = py % 8 < 4 ? '#ad7a49' : '#8e6039';
      for (let px = 0; px < TILE_SIZE; px += 1) {
        if ((px + py) % 11 === 0) this.pixel(ctx, x + px, y + py, '#79512f');
        else if (py % 8 === 0 || py % 8 === 1) this.pixel(ctx, x + px, y + py, tone);
      }
    }
    for (let px = 0; px < TILE_SIZE; px += 8) {
      this.rect(ctx, x + px, y, 1, TILE_SIZE, '#6d472a');
      this.rect(ctx, x + px + 1, y, 1, TILE_SIZE, '#bf8a57');
    }
  }

  private drawGrayTileFloor(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.fillTile(ctx, x, y, '#8f949b');
    for (let py = 0; py < TILE_SIZE; py += 1) {
      for (let px = 0; px < TILE_SIZE; px += 1) {
        if (px % 16 === 0 || py % 16 === 0) this.pixel(ctx, x + px, y + py, '#6b7078');
        else if ((px + py) % 7 === 0) this.pixel(ctx, x + px, y + py, '#a8adb6');
      }
    }
    this.rect(ctx, x + 15, y, 1, TILE_SIZE, '#c7ccd3');
    this.rect(ctx, x, y + 15, TILE_SIZE, 1, '#c7ccd3');
  }

  private drawCarpetFloor(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.fillTile(ctx, x, y, '#355785');
    for (let py = 0; py < TILE_SIZE; py += 2) {
      for (let px = 0; px < TILE_SIZE; px += 2) {
        const color = (px + py) % 8 === 0 ? '#5378ab' : (px * py) % 9 === 0 ? '#2a4667' : '#3d6294';
        this.rect(ctx, x + px, y + py, 1, 1, color);
      }
    }
    this.drawFrame(ctx, x, y, '#6088bf', '#233a58');
  }

  private drawConcreteFloor(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.fillTile(ctx, x, y, '#777b81');
    for (let py = 0; py < TILE_SIZE; py += 1) {
      for (let px = 0; px < TILE_SIZE; px += 1) {
        if ((px * 13 + py * 7) % 23 === 0) this.pixel(ctx, x + px, y + py, '#969aa0');
        if ((px * 5 + py * 11) % 29 === 0) this.pixel(ctx, x + px, y + py, '#5f646a');
      }
    }
  }

  private drawNorthWall(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
    this.rect(ctx, x, y, TILE_SIZE, 8, palette.dark);
    this.rect(ctx, x + 1, y + 1, TILE_SIZE - 2, 2, palette.accent2 ?? palette.light);
    this.rect(ctx, x, y + 8, TILE_SIZE, 2, palette.light);
  }

  private drawSouthWall(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
    this.rect(ctx, x, y + 24, TILE_SIZE, 8, palette.dark);
    this.rect(ctx, x, y + 22, TILE_SIZE, 2, palette.light);
    this.rect(ctx, x + 1, y + 29, TILE_SIZE - 2, 2, palette.accent ?? palette.dark);
  }

  private drawWestWall(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
    this.rect(ctx, x, y, 8, TILE_SIZE, palette.dark);
    this.rect(ctx, x + 8, y, 2, TILE_SIZE, palette.light);
    this.rect(ctx, x + 1, y + 1, 2, TILE_SIZE - 2, palette.accent2 ?? palette.light);
  }

  private drawEastWall(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
    this.rect(ctx, x + 24, y, 8, TILE_SIZE, palette.dark);
    this.rect(ctx, x + 22, y, 2, TILE_SIZE, palette.light);
    this.rect(ctx, x + 29, y + 1, 2, TILE_SIZE - 2, palette.accent ?? palette.dark);
  }

  private drawCornerHighlight(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    corner: 'nw' | 'ne' | 'sw' | 'se',
    palette: Palette,
  ) {
    const points = {
      nw: [x + 4, y + 4],
      ne: [x + 27, y + 4],
      sw: [x + 4, y + 27],
      se: [x + 27, y + 27],
    } as const;
    const [cx, cy] = points[corner];
    this.rect(ctx, cx - 2, cy - 2, 5, 5, palette.accent ?? palette.dark);
    this.rect(ctx, cx - 1, cy - 1, 3, 3, palette.light);
  }

  private drawDoorVertical(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
    this.fillTile(ctx, x, y, '#7d6b58');
    this.drawFrame(ctx, x, y, '#a88f74', '#56493b');
    this.rect(ctx, x + 10, y + 3, 12, 26, '#6a5646');
    this.rect(ctx, x + 11, y + 4, 10, 24, '#8e785f');
    this.rect(ctx, x + 15, y + 4, 1, 24, '#574637');
    this.rect(ctx, x + 18, y + 16, 2, 2, '#d9c37a');
    this.rect(ctx, x, y, 4, TILE_SIZE, palette.dark);
    this.rect(ctx, x + 28, y, 4, TILE_SIZE, palette.dark);
  }

  private drawDoorHorizontal(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
    this.fillTile(ctx, x, y, '#7d6b58');
    this.drawFrame(ctx, x, y, '#a88f74', '#56493b');
    this.rect(ctx, x + 3, y + 10, 26, 12, '#6a5646');
    this.rect(ctx, x + 4, y + 11, 24, 10, '#8e785f');
    this.rect(ctx, x + 4, y + 15, 24, 1, '#574637');
    this.rect(ctx, x + 16, y + 12, 2, 2, '#d9c37a');
    this.rect(ctx, x, y, TILE_SIZE, 4, palette.dark);
    this.rect(ctx, x, y + 28, TILE_SIZE, 4, palette.dark);
  }

  private drawDeskWood(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 4, 24, 24, 5);
    this.rect(ctx, x + 4, y + 8, 24, 12, '#7d5231');
    this.rect(ctx, x + 5, y + 9, 22, 3, '#aa7548');
    this.rect(ctx, x + 6, y + 12, 20, 6, '#94643d');
    this.rect(ctx, x + 6, y + 20, 3, 8, '#5d3c24');
    this.rect(ctx, x + 23, y + 20, 3, 8, '#5d3c24');
    this.rect(ctx, x + 10, y + 11, 5, 2, '#d8cfb6');
  }

  private drawDeskMetal(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 4, 24, 24, 5);
    this.rect(ctx, x + 4, y + 8, 24, 12, '#7c8793');
    this.rect(ctx, x + 5, y + 9, 22, 3, '#aeb7c1');
    this.rect(ctx, x + 6, y + 12, 20, 6, '#9099a3');
    this.rect(ctx, x + 6, y + 20, 3, 8, '#5d6771');
    this.rect(ctx, x + 23, y + 20, 3, 8, '#5d6771');
    this.rect(ctx, x + 18, y + 11, 4, 3, '#223449');
  }

  private drawChairWood(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 8, 20, 16, 4);
    this.rect(ctx, x + 9, y + 10, 14, 7, '#925f3b');
    this.rect(ctx, x + 10, y + 6, 12, 5, '#a87148');
    this.rect(ctx, x + 10, y + 17, 2, 10, '#684228');
    this.rect(ctx, x + 20, y + 17, 2, 10, '#684228');
  }

  private drawChairMetal(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 8, 20, 16, 4);
    this.rect(ctx, x + 9, y + 10, 14, 7, '#56626d');
    this.rect(ctx, x + 10, y + 6, 12, 5, '#8a98a5');
    this.rect(ctx, x + 10, y + 17, 2, 10, '#3c454d');
    this.rect(ctx, x + 20, y + 17, 2, 10, '#3c454d');
  }

  private drawPlantSmall(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 8, 22, 16, 4);
    this.rect(ctx, x + 11, y + 20, 10, 7, '#7b5233');
    this.rect(ctx, x + 13, y + 17, 6, 3, '#91603d');
    this.drawCircle(ctx, x + 16, y + 13, 7, '#4e9d4f');
    this.drawCircle(ctx, x + 12, y + 12, 4, '#60b865');
    this.drawCircle(ctx, x + 20, y + 12, 4, '#3f7d42');
  }

  private drawPlantLarge(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 5, 23, 22, 5);
    this.rect(ctx, x + 10, y + 22, 12, 6, '#7a5032');
    this.rect(ctx, x + 12, y + 19, 8, 3, '#936342');
    this.drawCircle(ctx, x + 16, y + 12, 10, '#4b944f');
    this.drawCircle(ctx, x + 10, y + 14, 6, '#63b76a');
    this.drawCircle(ctx, x + 22, y + 14, 6, '#387440');
    this.drawCircle(ctx, x + 16, y + 7, 5, '#79c978');
  }

  private drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 4, 24, 24, 5);
    this.rect(ctx, x + 5, y + 4, 22, 24, '#6f472a');
    this.rect(ctx, x + 7, y + 6, 18, 4, '#8f603d');
    this.rect(ctx, x + 7, y + 13, 18, 4, '#8f603d');
    this.rect(ctx, x + 7, y + 20, 18, 4, '#8f603d');
    const bookColors = ['#bc5252', '#d59f4d', '#4d78c8', '#6ca45d', '#8f66cc'];
    [7, 14, 21].forEach((shelfY, shelfIndex) => {
      for (let i = 0; i < 5; i += 1) {
        this.rect(ctx, x + 8 + i * 3, y + shelfY, 2, 5, bookColors[(shelfIndex + i) % bookColors.length]);
      }
    });
  }

  private drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 8, 23, 16, 4);
    this.rect(ctx, x + 10, y + 11, 12, 15, '#dde4ea');
    this.rect(ctx, x + 11, y + 12, 10, 4, '#b8d7ec');
    this.rect(ctx, x + 12, y + 4, 8, 9, '#79b8e3');
    this.rect(ctx, x + 13, y + 5, 6, 7, '#abd9f3');
    this.rect(ctx, x + 12, y + 16, 3, 2, '#4f94c4');
    this.rect(ctx, x + 17, y + 16, 3, 2, '#d06c6c');
  }

  private drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.shadow(ctx, x, y, 7, 23, 18, 4);
    this.rect(ctx, x + 8, y + 6, 16, 20, '#44484f');
    this.rect(ctx, x + 9, y + 7, 14, 4, '#737983');
    this.rect(ctx, x + 11, y + 12, 10, 6, '#111317');
    this.rect(ctx, x + 12, y + 19, 8, 4, '#d6d9de');
    this.rect(ctx, x + 14, y + 21, 4, 4, '#8d5b2d');
    this.rect(ctx, x + 20, y + 10, 2, 8, '#c84d4d');
  }

  private fillTile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    this.rect(ctx, x, y, TILE_SIZE, TILE_SIZE, color);
  }

  private drawFrame(ctx: CanvasRenderingContext2D, x: number, y: number, light: string, dark: string) {
    this.rect(ctx, x, y, TILE_SIZE, 1, light);
    this.rect(ctx, x, y, 1, TILE_SIZE, light);
    this.rect(ctx, x, y + TILE_SIZE - 1, TILE_SIZE, 1, dark);
    this.rect(ctx, x + TILE_SIZE - 1, y, 1, TILE_SIZE, dark);
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, ox: number, oy: number, w: number, h: number) {
    this.rect(ctx, x + ox, y + oy, w, h, 'rgba(0, 0, 0, 0.18)');
  }

  private drawCircle(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, color: string) {
    for (let py = -radius; py <= radius; py += 1) {
      for (let px = -radius; px <= radius; px += 1) {
        if (px * px + py * py <= radius * radius) {
          this.pixel(ctx, centerX + px, centerY + py, color);
        }
      }
    }
  }

  private pixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }

  private rect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }
}
