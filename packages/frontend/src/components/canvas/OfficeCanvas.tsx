import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentPosition, TilemapData } from '@/types';
import { TilemapRenderer } from './TilemapRenderer';
import { AgentRenderer } from './AgentRenderer';
import { CameraController } from './CameraController';
import { useCanvas } from '@/hooks/useCanvas';

interface OfficeCanvasProps {
  tilemap: TilemapData;
  agents: AgentPosition[];
  onAgentSelect?: (agent: AgentPosition | null) => void;
  selectedAgentId?: string | null;
}

const VIEWPORT = { width: 1280, height: 840 };
const DRAG_THRESHOLD_PX = 5;

export const OfficeCanvas = ({ tilemap, agents, onAgentSelect, selectedAgentId }: OfficeCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(VIEWPORT);
  const cameraRef = useRef(new CameraController());
  const [cameraState, setCameraState] = useState(cameraRef.current.getSnapshot());

  const tilemapRenderer = useMemo(() => new TilemapRenderer(), []);
  const agentRenderer = useMemo(() => new AgentRenderer(), []);

  const syncCanvasSize = useCallback((recenter = false) => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (viewportRef.current.width === width && viewportRef.current.height === height) return;

    viewportRef.current = { width, height };

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (recenter) {
      cameraRef.current.centerOnMap(tilemap.width * tilemap.tileSize, tilemap.height * tilemap.tileSize, width, height);
      setCameraState(cameraRef.current.getSnapshot());
    }
  }, [tilemap.height, tilemap.tileSize, tilemap.width]);

  // Size once on mount + window resize (NOT ResizeObserver — avoids reflow feedback loop)
  useEffect(() => {
    syncCanvasSize(true);

    const onResize = () => syncCanvasSize(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [syncCanvasSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = pointerPosition(event);
      cameraRef.current.zoomAt(point.x, point.y, event.deltaY);
      setCameraState(cameraRef.current.getSnapshot());
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: viewportWidth, height: viewportHeight } = viewportRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    const background = ctx.createLinearGradient(0, 0, 0, viewportHeight);
    background.addColorStop(0, '#1d1b1f');
    background.addColorStop(1, '#0f1012');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    ctx.save();
    cameraRef.current.applyTransform(ctx);
    tilemapRenderer.renderFrame(ctx, tilemap, agents, () => agentRenderer.render(ctx, agents, selectedAgentId));
    ctx.restore();

    ctx.fillStyle = 'rgba(217, 208, 195, 0.08)';
    for (let i = 0; i < viewportWidth; i += 48) {
      ctx.fillRect(i, 0, 1, viewportHeight);
    }
  }, [agentRenderer, agents, selectedAgentId, tilemap, tilemapRenderer]);

  useCanvas(draw);

  const pointerPosition = useCallback((event: MouseEvent | WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { width: viewportWidth, height: viewportHeight } = viewportRef.current;
    const scaleX = viewportWidth / rect.width;
    const scaleY = viewportHeight / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  const worldPosition = useCallback((screenX: number, screenY: number) => {
    const { x: camX, y: camY, zoom } = cameraRef.current.getSnapshot();
    return {
      x: (screenX - camX) / zoom,
      y: (screenY - camY) / zoom,
    };
  }, []);

  // --- Native pointer events for drag + click ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId: number | null = null;
    let pointerDownPos: { screenX: number; screenY: number } | null = null;
    let didDrag = false;

    const flushState = () => {
      rafId = null;
      setCameraState(cameraRef.current.getSnapshot());
    };

    const scheduleStateUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(flushState);
    };

    const onDown = (e: PointerEvent) => {
      const point = pointerPosition(e);
      pointerDownPos = { screenX: point.x, screenY: point.y };
      didDrag = false;
    };

    const onMove = (e: PointerEvent) => {
      if (!pointerDownPos) return;

      const point = pointerPosition(e);

      if (!didDrag) {
        const dx = point.x - pointerDownPos.screenX;
        const dy = point.y - pointerDownPos.screenY;
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;

        didDrag = true;
        cameraRef.current.beginDrag(pointerDownPos.screenX, pointerDownPos.screenY);
      }

      cameraRef.current.drag(point.x, point.y);
      scheduleStateUpdate();
    };

    const onUp = (e: PointerEvent) => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (pointerDownPos && !didDrag) {
        // This was a click, not a drag — detect agent
        const point = pointerPosition(e);
        const worldPoint = worldPosition(point.x, point.y);
        const clickedAgent = agentRenderer.getAgentAtWorldPosition(worldPoint.x, worldPoint.y, agents, tilemap.tileSize);
        onAgentSelect?.(clickedAgent);
      }

      pointerDownPos = null;
      didDrag = false;
      cameraRef.current.endDrag();
      setCameraState(cameraRef.current.getSnapshot());
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [pointerPosition, worldPosition, agentRenderer, agents, onAgentSelect, tilemap.tileSize]);

  return (
    <div ref={hostRef} className="relative min-h-[600px] overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-panel shadow-black/40">
      <canvas
        ref={canvasRef}
        className="block cursor-grab touch-none active:cursor-grabbing"
      />

      <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs text-fog/90 backdrop-blur-md">
        <div className="font-semibold text-white">Camera</div>
        <div>Zoom {cameraState.zoom.toFixed(2)}×</div>
        <div>Pan {Math.round(cameraState.x)}, {Math.round(cameraState.y)}</div>
      </div>

      {selectedAgentId && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs text-[#9fd28f]/90 backdrop-blur-md">
          <div className="font-semibold text-white">Selected</div>
          <div className="text-sm text-[#9fd28f]">{agents.find((a) => a.id === selectedAgentId)?.name ?? 'Unknown'}</div>
        </div>
      )}
    </div>
  );
};
