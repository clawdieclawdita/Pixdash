import type { Direction } from '@pixdash/shared';
import type { AgentPosition } from '@/types';
import { generateSpriteSheet, hashAppearance } from '@/lib/sprite-generator';

const TILE_SIZE = 32;
const SPRITE_SOURCE_SIZE = 16;
const SPRITE_DRAW_SIZE = 32;
const SPRITE_OFFSET_X = 0;
const SPRITE_OFFSET_Y = -2;

type SpriteCacheEntry = {
  canvases: Record<Direction, HTMLCanvasElement[]>;
};

const STATUS_COLORS = {
  busy: '#d96c3f',
  online: '#6dbd72',
  idle: '#d8c56c',
  offline: '#8f8f94'
} as const;

const spriteCache = new Map<string, SpriteCacheEntry>();

const createFrameCanvas = (frame: ImageData) => {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to create sprite canvas context.');
  }

  context.putImageData(frame, 0, 0);
  return canvas;
};

const getSpriteEntry = (agent: AgentPosition): SpriteCacheEntry => {
  const cacheKey = hashAppearance(agent.appearance);
  const cached = spriteCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const sheet = generateSpriteSheet(agent.appearance);
  const entry: SpriteCacheEntry = {
    canvases: {
      north: sheet.north.map(createFrameCanvas),
      south: sheet.south.map(createFrameCanvas),
      east: sheet.east.map(createFrameCanvas),
      west: sheet.west.map(createFrameCanvas)
    }
  };

  spriteCache.set(cacheKey, entry);
  return entry;
};

const OUTLINE_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

const glowCache = new Map<string, { outline: HTMLCanvasElement; outer: HTMLCanvasElement }>();

const getGlowCanvases = (sprite: HTMLCanvasElement): { outline: HTMLCanvasElement; outer: HTMLCanvasElement } => {
  const key = sprite.width + ':' + sprite.height + ':' + sprite.toDataURL().slice(-32);
  const cached = glowCache.get(key);
  if (cached) return cached;

  const srcCtx = sprite.getContext('2d');
  if (!srcCtx) return { outline: document.createElement('canvas'), outer: document.createElement('canvas') };

  const srcData = srcCtx.getImageData(0, 0, sprite.width, sprite.height);
  const w = sprite.width;
  const h = sprite.height;
  const scale = SPRITE_DRAW_SIZE / SPRITE_SOURCE_SIZE;

  // Crisp 1px contour canvas
  const outlineCanvas = document.createElement('canvas');
  outlineCanvas.width = SPRITE_DRAW_SIZE;
  outlineCanvas.height = SPRITE_DRAW_SIZE;
  const outCtx = outlineCanvas.getContext('2d')!;
  outCtx.imageSmoothingEnabled = false;

  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const idx = (sy * w + sx) * 4;
      if (srcData.data[idx + 3] === 0) continue;

      let isEdge = false;
      for (const [dx, dy] of OUTLINE_OFFSETS) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
          isEdge = true;
          break;
        }
        if (srcData.data[(ny * w + nx) * 4 + 3] === 0) {
          isEdge = true;
          break;
        }
      }

      if (isEdge) {
        outCtx.fillStyle = '#ffffff';
        outCtx.fillRect(sx * scale, sy * scale, scale, scale);
      }
    }
  }

  // Soft outer glow canvas (silhouette stamped at 1px offsets)
  const outerCanvas = document.createElement('canvas');
  outerCanvas.width = SPRITE_DRAW_SIZE + 2;
  outerCanvas.height = SPRITE_DRAW_SIZE + 2;
  const outerCtx = outerCanvas.getContext('2d')!;
  outerCtx.imageSmoothingEnabled = false;

  for (const [dx, dy] of OUTLINE_OFFSETS) {
    for (let sy = 0; sy < h; sy++) {
      for (let sx = 0; sx < w; sx++) {
        if (srcData.data[(sy * w + sx) * 4 + 3] > 0) {
          outerCtx.fillStyle = '#ffffff';
          outerCtx.fillRect(1 + (sx + dx) * scale, 1 + (sy + dy) * scale, scale, scale);
        }
      }
    }
  }

  const result = { outline: outlineCanvas, outer: outerCanvas };
  glowCache.set(key, result);
  return result;
};

const drawSpriteGlow = (
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  offsetX: number,
  offsetY: number,
 pulse: number
) => {
  const { outline, outer } = getGlowCanvases(sprite);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = `rgba(255, 255, 255, ${0.5 + pulse * 0.5})`;
  ctx.shadowBlur = 6 + pulse * 6;
  ctx.globalAlpha = 0.4 + pulse * 0.5;
  ctx.drawImage(outer, offsetX - 1, offsetY - 1);
  ctx.globalAlpha = 0.7 + pulse * 0.3;
  ctx.drawImage(outline, offsetX, offsetY);
  ctx.restore();
};

export class AgentRenderer {
  render(ctx: CanvasRenderingContext2D, agents: AgentPosition[], selectedAgentId?: string | null) {
    const ordered = [...agents].sort((a, b) => a.y - b.y);
    const now = performance.now();
    const frameIndex = Math.floor(now / 220) % 4;

    ordered.forEach((agent) => {
      const px = agent.x * TILE_SIZE;
      const py = agent.y * TILE_SIZE;
      const direction = agent.direction ?? 'south';
      const sprite = getSpriteEntry(agent).canvases[direction][frameIndex];
      const isSelected = agent.id === selectedAgentId;

      ctx.save();
      ctx.translate(px, py);
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(7, 25, 18, 5);

      if (isSelected) {
        const pulse = 0.6 + 0.4 * Math.sin(now / 400);
        drawSpriteGlow(ctx, sprite, SPRITE_OFFSET_X, SPRITE_OFFSET_Y, pulse);
      }

      ctx.drawImage(
        sprite,
        0,
        0,
        SPRITE_SOURCE_SIZE,
        SPRITE_SOURCE_SIZE,
        SPRITE_OFFSET_X,
        SPRITE_OFFSET_Y,
        SPRITE_DRAW_SIZE,
        SPRITE_DRAW_SIZE
      );

      ctx.fillStyle = STATUS_COLORS[agent.status] ?? STATUS_COLORS.offline;
      ctx.fillRect(22, 1, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(23, 2, 2, 2);
      ctx.restore();
    });
  }

  getAgentAtWorldPosition(worldX: number, worldY: number, agents: AgentPosition[], tileSize = TILE_SIZE): AgentPosition | null {
    const ordered = [...agents].sort((a, b) => b.y - a.y);

    for (const agent of ordered) {
      const bounds = this.getAgentBounds(agent, tileSize);
      if (
        worldX >= bounds.left &&
        worldX <= bounds.right &&
        worldY >= bounds.top &&
        worldY <= bounds.bottom
      ) {
        return agent;
      }
    }

    return null;
  }

  private getAgentBounds(agent: AgentPosition, tileSize: number) {
    const spriteLeft = agent.x * tileSize + SPRITE_OFFSET_X;
    const spriteTop = agent.y * tileSize + SPRITE_OFFSET_Y;

    return {
      left: spriteLeft,
      right: spriteLeft + SPRITE_DRAW_SIZE,
      top: spriteTop,
      bottom: spriteTop + SPRITE_DRAW_SIZE,
    };
  }
}
