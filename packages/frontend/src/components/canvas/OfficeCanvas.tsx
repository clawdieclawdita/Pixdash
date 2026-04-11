import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentPosition } from '@/types';
import officeBackgroundUrl from '@assets/sprites/office.png';
import { AgentRenderer } from './AgentRenderer';
import { CameraController } from './CameraController';
import { useCanvas } from '@/hooks/useCanvas';
import { useMovementStore } from '@/store/movementStore';
import { agentsStore } from '@/store/agentsStore';
import { smoothPositionTargets } from '@/hooks/useAgents';
import { OFFICE_HEIGHT, OFFICE_WIDTH } from '@/lib/officeScene';

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

// Per-frame smooth position cache — updated by draw loop, NOT Zustand
const smoothPositions = new Map<string, { x: number; y: number; targetX: number; targetY: number; prevTargetX?: number; prevTargetY?: number; targetTime: number; prevTargetTime?: number }>();
const LERP_SPEED = 0.35; // 0 = no movement, 1 = instant snap
const EXTRAPOLATE_DURATION_MS = 120; // extrapolate beyond last known target for this long

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

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

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
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
    const renderOverrides = new Map<string, { x: number; y: number }>();
    const now = performance.now();

    for (const agent of currentAgents) {
      const target = smoothPositionTargets.get(agent.id);
      const isMoving = agent.movementState === 'walking' || (agent.path?.length ?? 0) > 0;

      if (!target || !isMoving) {
        smoothPositions.delete(agent.id);
        continue;
      }

      let sp = smoothPositions.get(agent.id);
      const targetX = target.x;
      const targetY = target.y;

      if (!sp) {
        // First frame for this agent — snap to target to avoid warp from spawn
        sp = { x: targetX, y: targetY, targetX, targetY, targetTime: now };
        smoothPositions.set(agent.id, sp);
        renderOverrides.set(agent.id, { x: sp.x, y: sp.y });
        continue;
      }

      if (sp.targetX !== targetX || sp.targetY !== targetY) {
        // New target from backend
        sp.prevTargetX = sp.targetX;
        sp.prevTargetY = sp.targetY;
        sp.prevTargetTime = sp.targetTime;
        sp.targetX = targetX;
        sp.targetY = targetY;
        sp.targetTime = now;
      }

      // Lerp toward the last known target
      sp.x += (sp.targetX - sp.x) * LERP_SPEED;
      sp.y += (sp.targetY - sp.y) * LERP_SPEED;

      // Extrapolate beyond target using velocity from last two updates
      const timeSinceTarget = now - sp.targetTime;
      if (
        timeSinceTarget > 30 &&
        sp.prevTargetX != null && sp.prevTargetY != null && sp.prevTargetTime != null
      ) {
        const dt = sp.targetTime - sp.prevTargetTime;
        if (dt > 0 && timeSinceTarget < EXTRAPOLATE_DURATION_MS) {
          const vx = (sp.targetX - sp.prevTargetX) / dt;
          const vy = (sp.targetY - sp.prevTargetY) / dt;
          const extraTime = Math.min(timeSinceTarget - 30, EXTRAPOLATE_DURATION_MS - 30);
          const exX = sp.targetX + vx * extraTime;
          const exY = sp.targetY + vy * extraTime;
          sp.x += (exX - sp.x) * 0.5;
          sp.y += (exY - sp.y) * 0.5;
        }
      }

      // Snap if close enough
      if (Math.abs(sp.targetX - sp.x) < 0.5 && Math.abs(sp.targetY - sp.y) < 0.5) {
        sp.x = sp.targetX;
        sp.y = sp.targetY;
      }

      // Clamp to office bounds (pixel coords: 0 to 2400×1792)
      sp.x = Math.max(0, Math.min(sp.x, 2400));
      sp.y = Math.max(0, Math.min(sp.y, 1792));

      renderOverrides.set(agent.id, { x: sp.x, y: sp.y });
    }

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
        const camState = cameraRef.current.getSnapshot();
        const { width: vpWidth, height: vpHeight } = viewportRef.current;
        const rect = canvasRef.current?.getBoundingClientRect();
        console.log('=== CLICK DEBUG ===');
        console.log('clientX/Y:', event.clientX, event.clientY);
        console.log('rect:', rect?.left, rect?.top, rect?.width, rect?.height);
        console.log('viewportRef:', vpWidth, vpHeight);
        console.log('camera state:', camState);
        console.log('pointerPosition:', point);
        console.log('worldPosition:', worldPoint);
        console.log('tile:', tileX, tileY);
        console.log('===================');
        setClickCoords({ px: Math.round(worldPoint.x), py: Math.round(worldPoint.y), tileX, tileY });
        const clickedAgent = agentRenderer.getAgentAtWorldPosition(worldPoint.x, worldPoint.y, agentsRef.current);
        onAgentSelect?.(clickedAgent);
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
  }, [pointerPosition, worldPosition, agentRenderer, onAgentSelect]);

  return (
    <div ref={hostRef} className="relative h-full overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-panel shadow-black/40">
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
        className="pointer-events-auto absolute top-4 right-4 flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
        </svg>
        Fit
      </button>

        <div className="pointer-events-none absolute left-4 bottom-[6.5rem] rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs text-fog/90 backdrop-blur-md">
          <div className="font-semibold text-white">Click</div>
          <div>Pixel {clickCoords.px}, {clickCoords.py}</div>
          <div>Tile ({clickCoords.tileX}, {clickCoords.tileY})</div>
          <div className="mt-2 text-white/50">VP: {viewportRef.current.width}×{viewportRef.current.height}</div>
        </div>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs text-fog/90 backdrop-blur-md">
        <div className="font-semibold text-white">Camera</div>
        <div>Zoom {cameraState.zoom.toFixed(2)}×</div>
        <div>Pan {Math.round(cameraState.x)}, {Math.round(cameraState.y)}</div>
      </div>

      {selectedAgentId && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs text-[#9fd28f]/90 backdrop-blur-md">
          <div className="font-semibold text-white">Selected</div>
          <div className="text-sm text-[#9fd28f]">{agents.find((agent) => agent.id === selectedAgentId)?.name ?? 'Unknown'}</div>
        </div>
      )}
    </div>
  );
};
