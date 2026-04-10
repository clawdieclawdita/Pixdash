import type { Direction, Position } from './agent.js';

export type CanonicalWaypointType = 'spawn' | 'parking';
export type MovementAuthorityStatus = 'idle' | 'moving';

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
