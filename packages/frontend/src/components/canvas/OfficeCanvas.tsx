import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentPosition } from '@/types';
import officeBackgroundUrl from '@assets/sprites/office.png';
import { AgentRenderer } from './AgentRenderer';
import { CameraController } from './CameraController';
import { useCanvas } from '@/hooks/useCanvas';
import { useMovementStore } from '@/store/movementStore';
import { agentsStore } from '@/store/agentsStore';
import { debugAgent } from '@/lib/debug';
import { smoothPositionTargets } from '@/hooks/useAgents';
import { OFFICE_HEIGHT, OFFICE_WIDTH } from '@/lib/officeScene';
import type { Direction } from '@pixdash/shared';

interface OfficeCanvasProps {
  agents: AgentPosition[];
  onAgentSelect?: (agent: AgentPosition | null) => void;
  selectedAgentId?: string | null;
}

const VIEWPORT = { width: 1280, height: 840 };
const DRAG_THRESHOLD_PX = 5;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load office background: ${src}`));
    image.src = src;
  });


export const OfficeCanvas = ({ agents, onAgentSelect, selectedAgentId }: OfficeCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(VIEWPORT);
  const cameraRef = useRef(new CameraController());
  const [cameraState, setCameraState] = useState(cameraRef.current.getSnapshot());
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [clickCoords, setClickCoords] = useState({ px: 0, py: 0, tileX: 0, tileY: 0 });

  const agentRenderer = useMemo(() => new AgentRenderer(), []);
  const agentsRef = useRef(agents);
  const onAgentSelectRef = useRef(onAgentSelect);
  const renderOverridesRef = useRef<Map<string, { x: number; y: number; direction?: Direction; isMoving?: boolean }>>(new Map());

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    onAgentSelectRef.current = onAgentSelect;
  }, [onAgentSelect]);

  const syncCanvasSize = useCallback((recenter = false) => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const expectedPixelWidth = Math.round(width * dpr);
    const expectedPixelHeight = Math.round(height * dpr);
    const sizeChanged = viewportRef.current.width !== width || viewportRef.current.height !== height;
    const dprChanged = canvas.width !== expectedPixelWidth || canvas.height !== expectedPixelHeight;

    if (!sizeChanged && !dprChanged) return;

    viewportRef.current = { width, height };
    canvas.width = expectedPixelWidth;
    canvas.height = expectedPixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (recenter) {
      cameraRef.current.centerOnMap(OFFICE_WIDTH, OFFICE_HEIGHT, width, height);
      setCameraState(cameraRef.current.getSnapshot());
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    void loadImage(officeBackgroundUrl).then((image) => {
      if (mounted) {
        setBackgroundImage(image);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const ensureInitialized = useMovementStore((state) => state.ensureInitialized);

  useEffect(() => {
    syncCanvasSize(true);

    const onResize = () => syncCanvasSize(false);
    let resolutionMediaQuery: MediaQueryList | null = null;
    let removeResolutionListener: (() => void) | null = null;

    const bindResolutionListener = () => {
      removeResolutionListener?.();
      resolutionMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);

      const handleResolutionChange = () => {
        syncCanvasSize(false);
        bindResolutionListener();
      };

      if (typeof resolutionMediaQuery.addEventListener === 'function') {
        resolutionMediaQuery.addEventListener('change', handleResolutionChange);
        removeResolutionListener = () => resolutionMediaQuery?.removeEventListener('change', handleResolutionChange);
        return;
      }

      resolutionMediaQuery.addListener(handleResolutionChange);
      removeResolutionListener = () => resolutionMediaQuery?.removeListener(handleResolutionChange);
    };

    bindResolutionListener();
    window.addEventListener('resize', onResize);
    return () => {
      removeResolutionListener?.();
      window.removeEventListener('resize', onResize);
    };
  }, [syncCanvasSize]);

  useEffect(() => {
    void ensureInitialized();
  }, [ensureInitialized]);

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

    const currentAgents = agentsStore.getState().agents;
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

    if (backgroundImage) {
      ctx.drawImage(backgroundImage, 0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
    } else {
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
    }

    // Per-frame smooth interpolation toward backend targets with extrapolation
    const renderOverrides = new Map<string, { x: number; y: number; direction?: Direction; isMoving?: boolean }>();

    for (const agent of currentAgents) {
      const target = smoothPositionTargets.get(agent.id);
      const isMoving = !!target?.moving;

      if (!isMoving) {
        const override = {
          x: agent.interpolatedX ?? agent.x,
          y: agent.interpolatedY ?? agent.y,
          direction: agent.waypointDirection ?? agent.direction ?? undefined,
          isMoving: false,
        };
        renderOverrides.set(agent.id, override);
        debugAgent(agent.id, '[pixdash][override] ' + agent.id, { source: 'store', override, movementState: agent.movementState, pathLen: agent.path?.length ?? 0 });
        continue;
      }

      const override = {
        x: Math.max(0, Math.min(target.x, 2400)),
        y: Math.max(0, Math.min(target.y, 1792)),
        direction: target.direction,
        isMoving: true,
      };
      renderOverrides.set(agent.id, override);
      debugAgent(agent.id, '[pixdash][override] ' + agent.id, {
          source: 'smooth-target',
          override,
          target,
          movementState: agent.movementState,
          pathLen: agent.path?.length ?? 0,
          storeXY: { x: agent.x, y: agent.y },
          interpXY: { x: agent.interpolatedX, y: agent.interpolatedY },
        });
    }

    renderOverridesRef.current = renderOverrides;
    agentRenderer.render(ctx, currentAgents, selectedAgentId, renderOverrides);
    ctx.restore();
  }, [agentRenderer, backgroundImage, selectedAgentId]);

  useCanvas(() => {
    draw();
  });

  const pointerPosition = useCallback((event: MouseEvent | PointerEvent | WheelEvent) => {
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId: number | null = null;
    let pointerDownPos: { screenX: number; screenY: number } | null = null;
    let activePointerId: number | null = null;
    let didDrag = false;

    const flushState = () => {
      rafId = null;
      setCameraState(cameraRef.current.getSnapshot());
    };

    const scheduleStateUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(flushState);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const point = pointerPosition(event);
      pointerDownPos = { screenX: point.x, screenY: point.y };
      activePointerId = event.pointerId;
      didDrag = false;
      canvas.setPointerCapture(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      if (!pointerDownPos || (activePointerId !== null && event.pointerId !== activePointerId)) return;

      const point = pointerPosition(event);

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

    const endPointerInteraction = (event: PointerEvent) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) return;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (pointerDownPos && !didDrag) {
        const point = pointerPosition(event);
        const worldPoint = worldPosition(point.x, point.y);
        const tileX = Math.floor(worldPoint.x / 32);
        const tileY = Math.floor(worldPoint.y / 32);
        setClickCoords({ px: Math.round(worldPoint.x), py: Math.round(worldPoint.y), tileX, tileY });
        const clickedAgent = agentRenderer.getAgentAtWorldPosition(
          worldPoint.x,
          worldPoint.y,
          agentsRef.current,
          renderOverridesRef.current
        );
        onAgentSelectRef.current?.(clickedAgent);
      }

      if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
        canvas.releasePointerCapture(activePointerId);
      }

      pointerDownPos = null;
      activePointerId = null;
      didDrag = false;
      cameraRef.current.endDrag();
      setCameraState(cameraRef.current.getSnapshot());
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endPointerInteraction);
    window.addEventListener('pointercancel', endPointerInteraction);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
        canvas.releasePointerCapture(activePointerId);
      }
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endPointerInteraction);
      window.removeEventListener('pointercancel', endPointerInteraction);
    };
  }, [pointerPosition, worldPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={hostRef} className="pixel-frame crt-panel relative h-full overflow-hidden rounded-[18px] bg-black/30">
      <canvas
        ref={canvasRef}
        className="block cursor-grab touch-none active:cursor-grabbing"
      />

      <button
        type="button"
        onClick={() => {
          const host = hostRef.current;
          const canvas = canvasRef.current;
          if (!host || !canvas) return;

          // Force re-measure viewport
          const rect = host.getBoundingClientRect();
          const width = Math.max(1, Math.floor(rect.width));
          const height = Math.max(1, Math.floor(rect.height));
          viewportRef.current = { width, height };

          cameraRef.current.centerOnMap(OFFICE_WIDTH, OFFICE_HEIGHT, width, height);
          setCameraState(cameraRef.current.getSnapshot());
        }}
        className="pixel-button pointer-events-auto absolute right-4 top-4 flex items-center gap-1.5 rounded-[10px] bg-[#15110d]/90 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f0d6a5] backdrop-blur-md transition-colors hover:brightness-110 active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
        </svg>
        Fit
      </button>

        <div className="pixel-frame pointer-events-none absolute bottom-[6.5rem] left-4 rounded-[12px] bg-[#100d11]/90 px-4 py-3 text-xs text-fog/90 backdrop-blur-md">
          <div className="font-display text-[11px] text-white">Click</div>
          <div>Pixel {clickCoords.px}, {clickCoords.py}</div>
          <div>Tile ({clickCoords.tileX}, {clickCoords.tileY})</div>
          <div className="mt-2 text-white/50">VP: {viewportRef.current.width}×{viewportRef.current.height}</div>
        </div>
      <div className="pixel-frame pointer-events-none absolute bottom-4 left-4 rounded-[12px] bg-[#100d11]/90 px-4 py-3 text-xs text-fog/90 backdrop-blur-md">
        <div className="font-display text-[11px] text-white">Camera</div>
        <div>Zoom {cameraState.zoom.toFixed(2)}×</div>
        <div>Pan {Math.round(cameraState.x)}, {Math.round(cameraState.y)}</div>
      </div>

      {selectedAgentId && (
        <div className="pixel-frame pointer-events-none absolute bottom-4 right-4 rounded-[12px] bg-[#100d11]/90 px-4 py-3 text-xs text-[#00d4aa]/90 backdrop-blur-md">
          <div className="font-display text-[11px] text-white">Selected</div>
          <div className="text-sm text-[#00d4aa]">{agents.find((agent) => agent.id === selectedAgentId)?.name ?? 'Unknown'}</div>
        </div>
      )}
    </div>
  );
};
