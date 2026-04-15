import type { AgentPosition } from '@/types';
import type { Direction } from '@pixdash/shared';
import { getWalkFrameIndex } from '@/lib/movement';
import { isDebug, isDebugAgent } from '@/lib/debug';
import { loadSpriteTemplate, pickSpriteTemplateFromAppearance, clearSpriteTemplateCache, type SpriteSheetFrames } from '@/lib/spriteSheets';

const SPRITE_DRAW_WIDTH = 235;
const SPRITE_DRAW_HEIGHT = 177;
const SPRITE_OFFSET_X = -Math.round(SPRITE_DRAW_WIDTH / 2);
const SPRITE_OFFSET_Y = -SPRITE_DRAW_HEIGHT;

const spriteCache = new Map<string, SpriteSheetFrames>();
const loadingTemplates = new Set<string>();

const OUTLINE_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
] as const;

const glowCache = new Map<string, { outline: HTMLCanvasElement; outer: HTMLCanvasElement }>();

const ensureSpriteTemplate = (agent: AgentPosition) => {
  const template = pickSpriteTemplateFromAppearance(agent.appearance);

  if (spriteCache.has(template) || loadingTemplates.has(template)) {
    return;
  }

  loadingTemplates.add(template);
  void loadSpriteTemplate(template)
    .then((sheet) => {
      spriteCache.set(template, sheet);
    })
    .finally(() => {
      loadingTemplates.delete(template);
    });
};

const getSpriteFrames = (agent: AgentPosition): SpriteSheetFrames | null => {
  const template = pickSpriteTemplateFromAppearance(agent.appearance);
  return spriteCache.get(template) ?? null;
};

export const invalidateRendererSpriteCache = () => {
  spriteCache.clear();
  glowCache.clear();
  clearSpriteTemplateCache();
};

const getGlowCanvases = (sprite: HTMLCanvasElement): { outline: HTMLCanvasElement; outer: HTMLCanvasElement } => {
  const key = `${sprite.width}:${sprite.height}:${sprite.toDataURL().slice(-32)}`;
  const cached = glowCache.get(key);
  if (cached) return cached;

  const sourceContext = sprite.getContext('2d');
  if (!sourceContext) {
    return { outline: document.createElement('canvas'), outer: document.createElement('canvas') };
  }

  const sourceData = sourceContext.getImageData(0, 0, sprite.width, sprite.height);
  const width = sprite.width;
  const height = sprite.height;
  const scaleX = SPRITE_DRAW_WIDTH / width;
  const scaleY = SPRITE_DRAW_HEIGHT / height;

  const outlineCanvas = document.createElement('canvas');
  outlineCanvas.width = SPRITE_DRAW_WIDTH;
  outlineCanvas.height = SPRITE_DRAW_HEIGHT;
  const outlineContext = outlineCanvas.getContext('2d');

  const outerCanvas = document.createElement('canvas');
  outerCanvas.width = SPRITE_DRAW_WIDTH + 4;
  outerCanvas.height = SPRITE_DRAW_HEIGHT + 4;
  const outerContext = outerCanvas.getContext('2d');

  if (!outlineContext || !outerContext) {
    return { outline: outlineCanvas, outer: outerCanvas };
  }

  outlineContext.imageSmoothingEnabled = false;
  outerContext.imageSmoothingEnabled = false;

  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    for (let sourceX = 0; sourceX < width; sourceX += 1) {
      const alphaIndex = (sourceY * width + sourceX) * 4 + 3;
      if (sourceData.data[alphaIndex] === 0) continue;

      let isEdge = false;
      for (const [deltaX, deltaY] of OUTLINE_OFFSETS) {
        const nextX = sourceX + deltaX;
        const nextY = sourceY + deltaY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          isEdge = true;
          break;
        }
        if (sourceData.data[(nextY * width + nextX) * 4 + 3] === 0) {
          isEdge = true;
          break;
        }
      }

      const drawX = Math.round(sourceX * scaleX);
      const drawY = Math.round(sourceY * scaleY);
      const drawWidth = Math.max(1, Math.ceil(scaleX));
      const drawHeight = Math.max(1, Math.ceil(scaleY));

      if (isEdge) {
        outlineContext.fillStyle = '#ffffff';
        outlineContext.fillRect(drawX, drawY, drawWidth, drawHeight);
      }

      for (const [deltaX, deltaY] of OUTLINE_OFFSETS) {
        outerContext.fillStyle = '#ffffff';
        outerContext.fillRect(drawX + 2 + deltaX, drawY + 2 + deltaY, drawWidth, drawHeight);
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
  ctx.shadowColor = `rgba(255, 255, 255, ${0.45 + pulse * 0.45})`;
  ctx.shadowBlur = 8 + pulse * 10;
  ctx.globalAlpha = 0.28 + pulse * 0.22;
  ctx.drawImage(outer, offsetX - 2, offsetY - 2);
  ctx.globalAlpha = 0.75 + pulse * 0.2;
  ctx.drawImage(outline, offsetX, offsetY);
  ctx.restore();
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};

const drawAgentLabel = (ctx: CanvasRenderingContext2D, agent: AgentPosition, px: number, py: number) => {
  const label = (agent.displayName ?? agent.name ?? agent.id).trim();
  if (!label) return;

  const transform = ctx.getTransform();
  const zoom = Math.min(Math.abs(transform.a) || 1, Math.abs(transform.d) || 1);
  const opacity = clamp(0.45 + (zoom - 0.35) * 0.9, 0.45, 1);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.font = "24px 'Press Start 2P', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textWidth = Math.ceil(ctx.measureText(label).width);
  const paddingX = 10;
  const labelWidth = textWidth + paddingX * 2;
  const labelHeight = 32;
  const labelX = Math.round(px - labelWidth / 2);
  const labelY = Math.round(py + 18);

  ctx.fillStyle = `rgba(12, 14, 18, ${0.62 * opacity})`;
  drawRoundedRect(ctx, labelX, labelY, labelWidth, labelHeight, 6);
  ctx.fill();

  ctx.fillStyle = `rgba(255, 255, 255, ${0.92 * opacity})`;
  ctx.fillText(label, px, labelY + labelHeight / 2 + 0.5);
  ctx.restore();
};

type AgentRenderOverride = { x: number; y: number; direction?: Direction; isMoving?: boolean };

export class AgentRenderer {
  render(ctx: CanvasRenderingContext2D, agents: AgentPosition[], selectedAgentId?: string | null, renderOverrides?: Map<string, AgentRenderOverride>) {
    const ordered = [...agents].sort((a, b) => {
      const ay = renderOverrides?.get(a.id)?.y ?? a.interpolatedY ?? a.y;
      const by = renderOverrides?.get(b.id)?.y ?? b.interpolatedY ?? b.y;
      return ay - by;
    });
    // DEBUG: verify render is called
    if (isDebug()) {
      const t = performance.now();
      if (!(window as any).__renderLogT || t - (window as any).__renderLogT > 1000) {
        (window as any).__renderLogT = t;
        console.log(`[pixdash] render() called: ${ordered.length} agents, overrides=${renderOverrides?.size ?? 0}`);
      }
    }
    const now = performance.now();

    ordered.forEach((agent) => {
      ensureSpriteTemplate(agent);
      const frames = getSpriteFrames(agent);
      if (!frames) return;

      const override = renderOverrides?.get(agent.id);
      const px = override ? override.x : (agent.interpolatedX ?? agent.x);
      const py = override ? override.y : (agent.interpolatedY ?? agent.y);
      // Skip rendering if position is clearly invalid (negative/off-map)
      if (px < -100 || py < -100 || px > 2500 || py > 1900) return;
      // Use override-driven isMoving (real-time from smooth targets, not throttled Zustand)
      // Fallback: only treat as moving if backend path exists AND we have position data
      // AND agent is NOT at a claimed waypoint (seated agents can still have stale path in Zustand)
      const hasPath = (agent.path?.length ?? 0) > 0;
      const hasPosition = override != null || agent.interpolatedX != null;
      const isAtClaimedSeat = !override?.isMoving && !!agent.claimedWaypointId;
      const isMoving = isAtClaimedSeat ? false : (override?.isMoving ?? (hasPath && hasPosition));
      // DEBUG: log when isMoving disagrees with visual expectation
      if (isDebug()) {
        const zustandMoving = agent.movementState === 'walking' || hasPath;
        if (isMoving !== zustandMoving) {
          console.log(`[pixdash] ${agent.name} isMoving=${isMoving} (override=${override?.isMoving} hasPath=${hasPath} hasPosition=${hasPosition}) zustand=${agent.movementState} pathLen=${agent.path?.length ?? 0}`);
        }
      }
      const direction = override?.direction ?? agent.direction ?? 'south';
      if (isDebugAgent(agent.id)) {
        console.log('[pixdash][draw]', agent.id, {
          isMoving,
          direction,
          px,
          py,
          override,
          movementState: agent.movementState,
          pathLen: agent.path?.length ?? 0,
          claimedWaypointId: agent.claimedWaypointId,
        });
      }
      const sprite = frames[direction][getWalkFrameIndex(isMoving)];
      if (!sprite) return;
      // DEBUG
      if (isDebug()) {
        const now = performance.now();
        if (!(window as any).__pixdashDebugLast || now - (window as any).__pixdashDebugLast > 500) {
          (window as any).__pixdashDebugLast = now;
          const frameIdx = getWalkFrameIndex(isMoving);
          const spriteRow = ['south','north','west','east'].indexOf(direction);
          console.log(`[pixdash] DRAW ${agent.name} moving=${isMoving} dir=${direction}(${spriteRow}) frame=${frameIdx} pos=(${px.toFixed(0)},${py.toFixed(0)}) mvState=${agent.movementState} pathLen=${agent.path?.length ?? 0} seatType=${agent.claimedWaypointId?.split('-')[0] ?? '-'}`);
        }
      }

      // When seated, shift sprite visually to appear ON the chair
      // Only apply offset if movementState confirms seated (not just claimedWaypointId)
      const isSeated = !isMoving && !!agent.claimedWaypointId && agent.movementState?.startsWith('seated');
      const offsetPx = isSeated ? (agent.visualOffsetX ?? 0) : 0;
      const offsetPy = isSeated ? (agent.visualOffsetY ?? 0) : 0;
      const renderX = px + offsetPx;
      const renderY = py + offsetPy;

      const isSelected = agent.id === selectedAgentId;
      const drawX = renderX + SPRITE_OFFSET_X;
      const drawY = renderY + SPRITE_OFFSET_Y;

      ctx.save();
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(renderX, renderY - 6, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        const pulse = 0.6 + 0.4 * Math.sin(now / 400);
        drawSpriteGlow(ctx, sprite, drawX, drawY, pulse);
      }

      ctx.drawImage(sprite, drawX, drawY, SPRITE_DRAW_WIDTH, SPRITE_DRAW_HEIGHT);
      drawAgentLabel(ctx, agent, renderX, renderY);
      ctx.restore();
    });
  }

  getAgentAtWorldPosition(
    worldX: number,
    worldY: number,
    agents: AgentPosition[],
    renderOverrides?: Map<string, AgentRenderOverride>
  ): AgentPosition | null {
    const ordered = [...agents].sort((a, b) => {
      const ay = this.getRenderPosition(a, renderOverrides).y;
      const by = this.getRenderPosition(b, renderOverrides).y;
      return by - ay;
    });

    for (const agent of ordered) {
      const bounds = this.getAgentBounds(agent, renderOverrides);
      if (worldX >= bounds.left && worldX <= bounds.right && worldY >= bounds.top && worldY <= bounds.bottom) {
        return agent;
      }
    }

    return null;
  }

  private getRenderPosition(agent: AgentPosition, renderOverrides?: Map<string, AgentRenderOverride>) {
    const override = renderOverrides?.get(agent.id);
    const px = override?.x ?? agent.interpolatedX ?? agent.x;
    const py = override?.y ?? agent.interpolatedY ?? agent.y;
    const hasPath = (agent.path?.length ?? 0) > 0;
    const hasPosition = override != null || agent.interpolatedX != null;
    const isAtClaimedSeat = !override?.isMoving && !!agent.claimedWaypointId;
    const isMoving = isAtClaimedSeat ? false : (override?.isMoving ?? (hasPath && hasPosition));
    const isSeated = !isMoving && !!agent.claimedWaypointId && agent.movementState?.startsWith('seated');
    const offsetPx = isSeated ? (agent.visualOffsetX ?? 0) : 0;
    const offsetPy = isSeated ? (agent.visualOffsetY ?? 0) : 0;

    return {
      x: px + offsetPx,
      y: py + offsetPy,
    };
  }

  private getAgentBounds(agent: AgentPosition, renderOverrides?: Map<string, AgentRenderOverride>) {
    const position = this.getRenderPosition(agent, renderOverrides);
    const spriteLeft = position.x + SPRITE_OFFSET_X;
    const spriteTop = position.y + SPRITE_OFFSET_Y;

    return {
      left: spriteLeft,
      right: spriteLeft + SPRITE_DRAW_WIDTH,
      top: spriteTop,
      bottom: spriteTop + SPRITE_DRAW_HEIGHT,
    };
  }
}
