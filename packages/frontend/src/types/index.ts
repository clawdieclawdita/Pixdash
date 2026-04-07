export interface TilemapData {
  version: number;
  width: number;
  height: number;
  tileSize: number;
  layers: {
    floor: number[][];
    furniture: number[][];
    walls: number[][];
  };
  spawnPoints: Array<{ x: number; y: number }>;
  walkable: boolean[][];
}

import type { Appearance, Direction } from '@pixdash/shared';

export type AgentStatus = 'working' | 'online' | 'idle' | 'busy' | 'offline' | 'conference';
export type MovementState = 'standing' | 'walking' | 'seated-working' | 'seated-idle' | 'seated-conference' | 'at-watercooler';

export interface AgentPathNode {
  x: number;
  y: number;
}

export interface AgentPosition {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  status: AgentStatus;
  direction?: Direction;
  appearance: Appearance;
  movementState?: MovementState;
  targetX?: number | null;
  targetY?: number | null;
  path?: AgentPathNode[];
  claimedWaypointId?: string | null;
  visualOffsetX?: number;
  visualOffsetY?: number;
}

export interface AgentProfile extends AgentPosition {
  title?: string;
  notes?: string;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  isDragging: boolean;
}

export interface TileOffset {
  x: number;
  y: number;
}
