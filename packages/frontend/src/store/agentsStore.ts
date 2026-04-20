import { create } from 'zustand';
import { DEFAULT_APPEARANCE, DEFAULT_POSITION, type Appearance, type BodyType, type Direction, type Position, type MovementAuthorityState } from '@pixdash/shared';
import type { Agent } from '@/lib/api';
import { updateDisplayName } from '@/lib/api';
import { getArrivalStateForMovementType, pixelToTile, tileToPixelCenter } from '@/lib/movement';
import { createWaypointSet, getAllWaypoints, type WaypointClaim } from '@/lib/waypoints';
import type { AgentPathNode, MovementState } from '@/types';

export type StoreAgent = Agent & {
  movement?: MovementAuthorityState;
  x: number;
  y: number;
  color: string;
  title?: string;
  notes?: string;
  movementState: MovementState;
  targetX: number | null;
  targetY: number | null;
  path: AgentPathNode[];
  claimedWaypointId: string | null;
  direction?: Direction;
  waypointDirection?: Direction;
  visualOffsetX?: number;
  visualOffsetY?: number;
  positionSource: 'backend' | 'fallback';
  interpolatedX?: number;
  interpolatedY?: number;
  bodyType: BodyType;
};

const initialWaypointSet = createWaypointSet();
const initialFallbackWaypoints = initialWaypointSet.desks;
const allInitialWaypoints = getAllWaypoints(initialWaypointSet);
const warnedAgentIds = new Set<string>();

const warnMissingPosition = (agent: Agent) => {
  if (warnedAgentIds.has(agent.id)) return;
  warnedAgentIds.add(agent.id);
  console.warn(`[PixDash] Agent "${agent.id}" is missing a valid position. Falling back to office desk placement.`);
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const normalizeAppearance = (appearance?: Agent['appearance']): Appearance => ({
  bodyType: appearance?.bodyType ?? DEFAULT_APPEARANCE.bodyType,
  hair: {
    style: appearance?.hair?.style ?? DEFAULT_APPEARANCE.hair.style,
    color: appearance?.hair?.color ?? DEFAULT_APPEARANCE.hair.color,
  },
  skinColor: appearance?.skinColor ?? DEFAULT_APPEARANCE.skinColor,
  outfit: {
    type: appearance?.outfit?.type ?? DEFAULT_APPEARANCE.outfit.type,
    color: appearance?.outfit?.color ?? DEFAULT_APPEARANCE.outfit.color,
  },
  accessories: appearance?.accessories ?? DEFAULT_APPEARANCE.accessories,
});

export const normalizeIncomingPosition = (position?: Position | null): Position | null => {
  if (isFiniteNumber(position?.x) && isFiniteNumber(position?.y)) {
    let px = position.x;
    let py = position.y;

    // Clamp to valid grid bounds — negative or out-of-range coordinates
    // indicate corrupted state. Reject them rather than passing through.
    if (px < 0 || py < 0 || px > 75 || py > 56) {
      return null;
    }

    const pixelPosition = tileToPixelCenter({ x: px, y: py });
    return {
      x: pixelPosition.x,
      y: pixelPosition.y,
      direction: position.direction ?? DEFAULT_POSITION.direction,
    };
  }

  return null;
};

const normalizePosition = (agent: Agent, fallbackIndex: number): Position => {
  const normalizedPosition = normalizeIncomingPosition(agent.position);
  if (normalizedPosition) {
    return normalizedPosition;
  }

  warnMissingPosition(agent);
  const fallbackWaypoint = initialFallbackWaypoints[fallbackIndex % initialFallbackWaypoints.length];
  const fallbackPosition = tileToPixelCenter(fallbackWaypoint);
  return {
    x: fallbackPosition.x,
    y: fallbackPosition.y,
    direction: fallbackWaypoint.direction ?? agent.position?.direction ?? DEFAULT_POSITION.direction,
  };
};

const getPositionSource = (agent: Agent): 'backend' | 'fallback' => (
  normalizeIncomingPosition(agent.position) ? 'backend' : 'fallback'
);

export const hasBackendMovementAuthority = (
  movement?: MovementAuthorityState | null,
): movement is MovementAuthorityState => {
  if (!movement) return false;

  return movement.status === 'moving'
    || movement.path.length > 0
    || movement.destination != null
    || movement.claimedWaypointId != null;
};

const defaultMovementState = (status: Agent['status']): MovementState => {
  if (status === 'working') return 'seated-working';
  if (status === 'conference') return 'seated-conference';
  if (status === 'idle' || status === 'online') return 'seated-idle';
  return 'standing';
};

const inferWaypointFromPosition = (agent: Agent, position: Position): WaypointClaim | null => {
  const tile = pixelToTile(position.x, position.y);
  const exactMatch = allInitialWaypoints.find((waypoint) => waypoint.x === tile.x && waypoint.y === tile.y) ?? null;
  if (!exactMatch) {
    return null;
  }

  if (agent.status === 'working' && exactMatch.type !== 'desk') {
    return null;
  }

  if (agent.status === 'conference' && exactMatch.type !== 'conference') {
    return null;
  }

  return exactMatch;
};

function normalizeAgent(agent: Agent, fallbackIndex: number): StoreAgent {
  const positionSource = getPositionSource(agent);
  const position = positionSource === 'backend'
    ? (normalizeIncomingPosition(agent.position) as Position)
    : normalizePosition(agent, fallbackIndex);
  const appearance = normalizeAppearance(agent.appearance);
  const backendMovement = agent.movement;
  const destination = backendMovement?.destination ? tileToPixelCenter(backendMovement.destination) : null;
  const inferredWaypoint = !hasBackendMovementAuthority(backendMovement) && positionSource === 'backend'
    ? inferWaypointFromPosition(agent, position)
    : null;
  const settledMovementState = inferredWaypoint ? getArrivalStateForMovementType(inferredWaypoint.type) : defaultMovementState(agent.status);

  return {
    ...agent,
    position,
    appearance,
    x: position.x,
    y: position.y,
    interpolatedX: backendMovement?.fractionalX,
    interpolatedY: backendMovement?.fractionalY,
    color: appearance.outfit.color,
    title: typeof agent.config?.title === 'string' ? agent.config.title : undefined,
    notes: typeof agent.config?.notes === 'string' ? agent.config.notes : undefined,
    movementState: backendMovement?.status === 'moving' ? 'walking' : settledMovementState,
    targetX: destination?.x ?? null,
    targetY: destination?.y ?? null,
    path: backendMovement?.path ?? [],
    claimedWaypointId: backendMovement?.claimedWaypointId ?? inferredWaypoint?.id ?? null,
    visualOffsetX: backendMovement?.visualOffsetX ?? inferredWaypoint?.visualOffsetX ?? 0,
    visualOffsetY: backendMovement?.visualOffsetY ?? inferredWaypoint?.visualOffsetY ?? 0,
    direction: position.direction,
    waypointDirection: backendMovement?.waypointDirection,
    movement: backendMovement,
    positionSource,
    bodyType: appearance?.bodyType ?? DEFAULT_APPEARANCE.bodyType,
  };
}

export interface MeetingInfo {
  id: string;
  agentIds: string[];
  sessionKey: string;
  startedAt: number;
  source: string;
}

interface AgentsState {
  agents: StoreAgent[];
  selectedAgentId: string | null;
  activeMeetings: MeetingInfo[];
  setAgents: (agents: Agent[]) => void;
  updateAgent: (agent: Partial<StoreAgent> & Pick<StoreAgent, 'id'>) => void;
  selectAgent: (agentId: string | null) => void;
  clearSelection: () => void;
  setDisplayName: (agentId: string, name: string | null) => Promise<void>;
  setActiveMeetings: (meetings: MeetingInfo[]) => void;
  addMeeting: (meeting: MeetingInfo) => void;
  removeMeeting: (meetingId: string) => void;
  isAgentInMeeting: (agentId: string) => boolean;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  activeMeetings: [],
  setAgents: (agents) =>
    set((state) => ({
      agents: agents.map((agent, index) => {
        const existing = state.agents.find((entry) => entry.id === agent.id);
        const normalized = normalizeAgent(agent, index);
        const backendAuthorityActive = hasBackendMovementAuthority(normalized.movement);
        const keepLocalPlacement = !backendAuthorityActive && existing?.movementState === 'walking';

        return existing
          ? {
              ...existing,
              ...normalized,
              x: keepLocalPlacement ? existing.x : normalized.x,
              y: keepLocalPlacement ? existing.y : normalized.y,
              movementState: keepLocalPlacement ? existing.movementState : normalized.movementState,
              targetX: keepLocalPlacement ? existing.targetX : normalized.targetX,
              targetY: keepLocalPlacement ? existing.targetY : normalized.targetY,
              path: keepLocalPlacement ? existing.path : normalized.path,
              claimedWaypointId: keepLocalPlacement ? existing.claimedWaypointId : normalized.claimedWaypointId,
              visualOffsetX: keepLocalPlacement ? existing.visualOffsetX : normalized.visualOffsetX,
              visualOffsetY: keepLocalPlacement ? existing.visualOffsetY : normalized.visualOffsetY,
              direction: keepLocalPlacement ? existing.direction : normalized.direction,
              interpolatedX: keepLocalPlacement ? existing.interpolatedX : normalized.interpolatedX,
              interpolatedY: keepLocalPlacement ? existing.interpolatedY : normalized.interpolatedY,
            }
          : normalized;
      }),
      selectedAgentId:
        state.selectedAgentId && agents.some((agent) => agent.id === state.selectedAgentId)
          ? state.selectedAgentId
          : null,
    })),
  updateAgent: (agentUpdate) =>
    set((state) => ({
      agents: state.agents.map((agent) => {
        if (agent.id !== agentUpdate.id) {
          return agent;
        }

        const nextPosition = {
          ...agent.position,
          ...(agentUpdate.position ?? {}),
        };
        const nextAppearance = normalizeAppearance({
          ...agent.appearance,
          ...(agentUpdate.appearance ?? {}),
          hair: {
            ...agent.appearance.hair,
            ...(agentUpdate.appearance?.hair ?? {}),
          },
          outfit: {
            ...agent.appearance.outfit,
            ...(agentUpdate.appearance?.outfit ?? {}),
          },
        });

        return {
          ...agent,
          ...agentUpdate,
          position: nextPosition,
          // Preserve current visual position unless explicitly updated.
          // Use agent.x/y (current) as fallback — NOT nextPosition.x/y (stale backend spawn).
          x: agentUpdate.position?.x ?? agentUpdate.x ?? agent.x,
          y: agentUpdate.position?.y ?? agentUpdate.y ?? agent.y,
          color: agentUpdate.appearance?.outfit?.color ?? agentUpdate.color ?? nextAppearance.outfit.color,
          appearance: nextAppearance,
          bodyType: agentUpdate.bodyType ?? nextAppearance.bodyType,
          movementState: agentUpdate.movementState ?? agent.movementState,
          targetX: agentUpdate.targetX === undefined ? agent.targetX : agentUpdate.targetX,
          targetY: agentUpdate.targetY === undefined ? agent.targetY : agentUpdate.targetY,
          path: agentUpdate.path ?? agent.path,
          claimedWaypointId: agentUpdate.claimedWaypointId === undefined ? agent.claimedWaypointId : agentUpdate.claimedWaypointId,
          interpolatedX: agentUpdate.interpolatedX === undefined ? agent.interpolatedX : agentUpdate.interpolatedX,
          interpolatedY: agentUpdate.interpolatedY === undefined ? agent.interpolatedY : agentUpdate.interpolatedY,
          waypointDirection: agentUpdate.waypointDirection === undefined ? agent.waypointDirection : agentUpdate.waypointDirection,
        };
      }),
    })),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  clearSelection: () => set({ selectedAgentId: null }),
  setDisplayName: async (agentId, name) => {
    const result = await updateDisplayName(agentId, name);
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, displayName: result.displayName ?? undefined } : a
      ),
    }));
  },
  setActiveMeetings: (meetings) => set({ activeMeetings: meetings }),
  addMeeting: (meeting) => set((state) => {
    if (state.activeMeetings.some((m) => m.id === meeting.id)) return state;
    return { activeMeetings: [...state.activeMeetings, meeting] };
  }),
  removeMeeting: (meetingId) => set((state) => ({
    activeMeetings: state.activeMeetings.filter((m) => m.id !== meetingId),
  })),
  isAgentInMeeting: (agentId) => {
    return get().activeMeetings.some((m) => m.agentIds.includes(agentId));
  },
}));

export const agentsStore = {
  getState: useAgentsStore.getState,
  subscribe: useAgentsStore.subscribe,
  setAgents: useAgentsStore.getState().setAgents,
  updateAgent: useAgentsStore.getState().updateAgent,
  selectAgent: useAgentsStore.getState().selectAgent,
  clearSelection: useAgentsStore.getState().clearSelection,
  setActiveMeetings: useAgentsStore.getState().setActiveMeetings,
  addMeeting: useAgentsStore.getState().addMeeting,
  removeMeeting: useAgentsStore.getState().removeMeeting,
  isAgentInMeeting: useAgentsStore.getState().isAgentInMeeting,
};
