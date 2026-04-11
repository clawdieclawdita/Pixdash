import { create } from 'zustand';
import type { AgentStatus } from '@pixdash/shared';
import { agentsStore, type StoreAgent } from '@/store/agentsStore';
import { loadCollisionMap, type CollisionMapData } from '@/lib/collisionMap';
import {
  createWaypointSet,
  findWaypointById,
  releaseWaypointClaim,
  type WaypointSet,
} from '@/lib/waypoints';

interface MovementStoreState {
  collisionMap: CollisionMapData | null;
  initialized: boolean;
  loadingPromise: Promise<void> | null;
  waypoints: WaypointSet;
  ensureInitialized: () => Promise<void>;
  syncAgents: (agents: StoreAgent[]) => void;
  placeAgentsOnLoad: (agents: StoreAgent[]) => Promise<void>;
  handleStatusChange: (agentId: string, status: AgentStatus) => Promise<void>;
  handleConference: (agentIds: string[]) => Promise<void>;
  removeAgent: (agentId: string) => void;
  tick: (deltaMs: number) => void;
}

export const useMovementStore = create<MovementStoreState>((set, get) => ({
  collisionMap: null,
  initialized: false,
  loadingPromise: null,
  waypoints: createWaypointSet(),
  ensureInitialized: async () => {
    const existingPromise = get().loadingPromise;
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const loadingPromise = loadCollisionMap().then((collisionMap) => {
      set({ collisionMap, initialized: true });
    });

    set({ loadingPromise });
    await loadingPromise.finally(() => set({ loadingPromise: null }));
  },
  syncAgents: (agents) => {
    const { waypoints } = get();
    const knownIds = new Set(agents.map((agent) => agent.id));

    for (const waypoint of [
      ...waypoints.desks,
      ...waypoints.receptionChairs,
      ...waypoints.restRoomChairs,
      ...waypoints.conferenceRoomChairs,
      ...waypoints.waterDispenser,
    ]) {
      if (waypoint.claimedBy && !knownIds.has(waypoint.claimedBy)) {
        waypoint.claimedBy = null;
      }
    }

    for (const agent of agents) {
      if (agent.claimedWaypointId) {
        const waypoint = findWaypointById(waypoints, agent.claimedWaypointId);
        if (waypoint) {
          waypoint.claimedBy = agent.id;
        }
      }
    }
  },
  placeAgentsOnLoad: async (_agents) => {
    // Server-authoritative migration: local placement is disabled.
    // Backend provides canonical positions for all agents via HTTP GET
    // and WebSocket broadcasts. The agentsStore normalizer handles
    // fallback positioning when backend data is absent.
    console.log('[PixDash Debug] placeAgentsOnLoad: skipped (server-authoritative mode)');
  },
  handleStatusChange: async (agentId, status) => {
    // Server-authoritative migration: local status-change movement is disabled.
    // Backend handles all movement in response to status changes.
    // Frontend only updates the agent's status field.
    const agent = agentsStore.getState().agents.find((entry) => entry.id === agentId);
    if (!agent) return;
    agentsStore.updateAgent({ id: agentId, status });
    console.log('[PixDash Debug] handleStatusChange: status-only update (server-authoritative)', JSON.stringify({ agentId, status }));
  },
  handleConference: async (agentIds) => {
    // Server-authoritative migration: local conference placement is disabled.
    // Backend handles conference seat assignment and movement.
    console.log('[PixDash Debug] handleConference: no-op (server-authoritative)', JSON.stringify({ agentIds }));
  },
  removeAgent: (agentId) => {
    releaseWaypointClaim(get().waypoints, agentId);
  },
  tick: (_deltaMs) => {
    const agents = agentsStore.getState().agents;

    for (const agent of agents) {
      if (agent.movement?.status === 'moving' && agent.movement.fractionalX != null && agent.movement.fractionalY != null) {
        if (agent.interpolatedX !== agent.movement.fractionalX || agent.interpolatedY !== agent.movement.fractionalY) {
          agentsStore.updateAgent({
            id: agent.id,
            interpolatedX: agent.movement.fractionalX,
            interpolatedY: agent.movement.fractionalY,
            direction: agent.direction,
          });
        }
        continue;
      }

      if (agent.interpolatedX != null || agent.interpolatedY != null) {
        agentsStore.updateAgent({
          id: agent.id,
          interpolatedX: undefined,
          interpolatedY: undefined,
        });
      }
    }
  },
}));

export const movementStore = {
  getState: useMovementStore.getState,
  subscribe: useMovementStore.subscribe,
  ensureInitialized: useMovementStore.getState().ensureInitialized,
  syncAgents: useMovementStore.getState().syncAgents,
  placeAgentsOnLoad: useMovementStore.getState().placeAgentsOnLoad,
  handleStatusChange: useMovementStore.getState().handleStatusChange,
  handleConference: useMovementStore.getState().handleConference,
  removeAgent: useMovementStore.getState().removeAgent,
  tick: useMovementStore.getState().tick,
};
