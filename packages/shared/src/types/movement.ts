import type { Direction, Position } from './agent.js';

export type CanonicalWaypointType = 'spawn' | 'parking' | 'desk' | 'reception' | 'restroom' | 'conference' | 'dining';
export type MovementAuthorityStatus = 'idle' | 'moving' | 'seated';

export interface CanonicalWaypoint {
  id: string;
  x: number;
  y: number;
  type: CanonicalWaypointType;
  claimedBy?: string | null;
}

export interface MovementPathNode {
  x: number;
  y: number;
}

export interface MovementAuthorityState {
  status: MovementAuthorityStatus;
  claimedWaypointId?: string | null;
  destination?: MovementPathNode | null;
  path: MovementPathNode[];
  lastUpdatedAt: string;
  visualOffsetX?: number;
  visualOffsetY?: number;
  waypointType?: string;
  waypointDirection?: Direction;
}

export interface AgentMovementEventPayload {
  agentId: string;
  movement: MovementAuthorityState;
  position: Position;
}

export interface MoveAgentRequest {
  agentId: string;
  waypointId?: string;
  destination?: MovementPathNode;
  direction?: Direction;
}
