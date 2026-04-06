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

export type AgentStatus = 'working' | 'online' | 'idle' | 'busy' | 'offline';

export interface AgentPosition {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  status: AgentStatus;
  direction?: Direction;
  appearance: Appearance;
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
