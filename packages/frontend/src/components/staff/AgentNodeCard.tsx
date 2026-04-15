import { useEffect, useRef } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { StoreAgent } from '@/store/agentsStore';
import { cn } from '@/lib/utils';
import { spriteUrls } from './spriteUrls';

type AgentNodeData = {
  agent: StoreAgent;
  role: string;
};

type AgentFlowNode = Node<AgentNodeData, 'agent'>;

const roleColors: Record<string, string> = {
  CEO: 'text-[#f0d6a5]',
  CDO: 'text-[#9fd28f]',
  CISO: 'text-[#f87171]',
  IM: 'text-[#93c5fd]',
  DM: 'text-[#c4b5fd]',
  Analyst: 'text-[#fbbf24]',
};

const statusConfig: Record<string, { label: string; labelClass: string }> = {
  working: { label: 'Working', labelClass: 'text-[#6dbd72]' },
  online: { label: 'Online', labelClass: 'text-[#6dbd72]' },
  idle: { label: 'Idle', labelClass: 'text-amber-200' },
  busy: { label: 'Busy', labelClass: 'text-rose-300' },
  conference: { label: 'Conference', labelClass: 'text-sky-200' },
  offline: { label: 'Offline', labelClass: 'text-slate-400' },
};

const SPRITE_SIZE = 64;
const SHEET_COLS = 3;
const SHEET_ROWS = 4;
const FRAME_COL = 0;
const FRAME_ROW = 0;

function drawFrame(canvas: HTMLCanvasElement, imgUrl: string) {
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameW = img.naturalWidth / SHEET_COLS;
    const frameH = img.naturalHeight / SHEET_ROWS;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(
      img,
      FRAME_COL * frameW,
      FRAME_ROW * frameH,
      frameW,
      frameH,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  };
  img.src = imgUrl;
}

function SpriteAvatar({ bodyType }: { bodyType: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteUrl = spriteUrls[bodyType] ?? spriteUrls.michael;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawFrame(canvas, spriteUrl);
  }, [spriteUrl]);

  return (
    <canvas
      ref={canvasRef}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      className="block h-16 w-16"
      style={{ width: `${SPRITE_SIZE}px`, height: `${SPRITE_SIZE}px`, imageRendering: 'pixelated' }}
    />
  );
}

const hiddenHandleStyle = {
  width: 8,
  height: 8,
  opacity: 0,
  background: 'transparent',
  border: 'none',
} as const;

export function AgentNodeCard({ data }: NodeProps<AgentFlowNode>) {
  const agent = data.agent;
  const role = data.role;
  const roleColor = roleColors[role] ?? 'text-[#b7aa96]';
  const status = agent.status ?? 'offline';
  const displayName = agent.displayName ?? agent.name ?? agent.id ?? '?';
  const config = statusConfig[status] ?? statusConfig.offline;
  const bodyType = agent.bodyType ?? 'michael';

  return (
    <div className="relative h-[88px] w-[260px]">
      <Handle type="target" position={Position.Top} style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Bottom} style={hiddenHandleStyle} />

      <div className="pixel-frame group relative flex h-[88px] w-[260px] flex-row items-center justify-center rounded-[14px] bg-gradient-to-b from-[#1a1714] to-[#0f0e10] px-4 py-3 transition-all duration-300 hover:brightness-110">
        <div className="pointer-events-none absolute inset-0 rounded-[14px] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.04)_2px,rgba(0,0,0,0.04)_4px)]" />

        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <SpriteAvatar bodyType={bodyType} />
        </div>

        <div className="relative ml-3 flex w-auto flex-col justify-center leading-[1.15]">
          <span className={cn('font-display text-[11px] uppercase tracking-[0.18em]', roleColor)}>
            {role}
          </span>

          <span className="mt-2 text-[14px] font-bold text-slate-200">
            {displayName}
          </span>

          <span className={cn('mt-[4px] text-[11px] uppercase tracking-[0.16em]', config.labelClass)}>
            {config.label}
          </span>
        </div>
      </div>
    </div>
  );
}
