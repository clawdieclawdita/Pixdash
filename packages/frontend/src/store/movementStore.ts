import { create } from 'zustand';
import type { AgentStatus, Direction } from '@pixdash/shared';
import { agentsStore, type StoreAgent } from '@/store/agentsStore';
import { loadCollisionMap, type CollisionMapData } from '@/lib/collisionMap';
import {
  advanceAgentAlongPath,
  findNearestWalkableTile,
  getArrivalStateForMovementType,
  pixelToTile,
  tileToPixelCenter,
} from '@/lib/movement';
import { findPath, isWalkableTile } from '@/lib/pathfinding';
import {
  claimWaypoint,
  createNoGoSet,
  distanceBetweenTiles,
  createWaypointSet,
  findWaypointById,
  pickNearestAvailableWaypoint,
  releaseWaypointClaim,
  type WaypointClaim,
  type WaypointSet,
} from '@/lib/waypoints';
import type { MovementState } from '@/types';

const HOME_BASE_RETURN_DELAY_MS = 60_000;

const AGENT_HOME_BASES: Record<string, { type: WaypointClaim['type']; preferredWaypointIds?: string[] }> = {
  main: { type: 'reception', preferredWaypointIds: ['reception-1', 'reception-2', 'reception-3'] },
};

const homeBaseReturnTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearHomeBaseReturnTimer = (agentId: string) => {
  const timer = homeBaseReturnTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    homeBaseReturnTimers.delete(agentId);
  }
};

const waypointGroupsForType = (waypoints: WaypointSet, type: WaypointClaim['type']): WaypointClaim[] => {
  switch (type) {
    case 'desk':
      return waypoints.desks;
    case 'restroom':
      return waypoints.restRoomChairs;
    case 'conference':
      return waypoints.conferenceRoomChairs;
    case 'reception':
      return waypoints.receptionChairs;
    case 'watercooler':
      return waypoints.waterDispenser;
  }
};

const pickHomeBaseWaypoint = (agentId: string, currentTile: { x: number; y: number }, waypoints: WaypointSet) => {
  const homeBase = AGENT_HOME_BASES[agentId];
  if (!homeBase) {
    return null;
  }

  const homeCandidates = waypointGroupsForType(waypoints, homeBase.type);
  const preferredCandidates = homeBase.preferredWaypointIds?.length
    ? homeCandidates.filter((waypoint) => homeBase.preferredWaypointIds?.includes(waypoint.id))
    : [];

  return (
    pickNearestAvailableWaypoint(preferredCandidates, currentTile, agentId) ??
    pickNearestAvailableWaypoint(homeCandidates, currentTile, agentId)
  );
};

const isAtHomeBaseWaypoint = (agentId: string, waypoint: WaypointClaim | null) => {
  const homeBase = AGENT_HOME_BASES[agentId];
  if (!homeBase || !waypoint || waypoint.type !== homeBase.type) {
    return false;
  }

  return !homeBase.preferredWaypointIds?.length || homeBase.preferredWaypointIds.includes(waypoint.id);
};

const IDLE_WANDER_MIN_MS = 60_000;
const IDLE_WANDER_MAX_MS = 90_000;
const wanderTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearWanderTimer = (agentId: string) => {
  const timer = wanderTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    wanderTimers.delete(agentId);
  }
};

const scheduleIdleWander = (agentId: string) => {
  clearWanderTimer(agentId);
  const delay = IDLE_WANDER_MIN_MS + Math.random() * (IDLE_WANDER_MAX_MS - IDLE_WANDER_MIN_MS);
  const timer = setTimeout(async () => {
    wanderTimers.delete(agentId);
    const movementState = useMovementStore.getState();
    const agent = agentsStore.getState().agents.find((a) => a.id === agentId);
    if (!agent || agent.status !== 'idle') return;
    // Release current waypoint so handleStatusChange picks a new one
    releaseWaypointClaim(movementState.waypoints, agentId);
    agentsStore.updateAgent({ id: agentId, movementState: 'standing', claimedWaypointId: null });
    // Now handleStatusChange will find no existing seated state and assign a new destination
    await movementState.handleStatusChange(agentId, 'idle');
  }, delay);
  wanderTimers.set(agentId, timer);
};

const pickIdleWaypoint = (agentId: string, currentTile: { x: number; y: number }, waypoints: WaypointSet) => {
  // Conference room is EXCLUSIVELY for session_send / multi-agent conversations
  // Never pick conference chairs during idle wander.
  const allCandidates: WaypointClaim[] = [
    ...waypoints.receptionChairs,
    ...waypoints.restRoomChairs,
    ...waypoints.desks,
    ...waypoints.waterDispenser,
  ];

  // Home base agents get weighted selection
  const homeBase = AGENT_HOME_BASES[agentId];
  if (homeBase) {
    const preferredHomeIds = new Set(homeBase.preferredWaypointIds ?? []);
    const preferredHomeCandidates = waypoints.receptionChairs.filter((wp) => preferredHomeIds.has(wp.id));

    const weightedGroups = [
      { weight: 0.6, candidates: preferredHomeCandidates.length > 0 ? preferredHomeCandidates : waypoints.receptionChairs },
      { weight: 0.2, candidates: waypoints.restRoomChairs },
      { weight: 0.1, candidates: waypoints.waterDispenser },
      { weight: 0.1, candidates: waypoints.desks },
    ];

    const roll = Math.random();
    let threshold = 0;
    for (const group of weightedGroups) {
      threshold += group.weight;
      if (roll <= threshold) {
        const wp = pickNearestAvailableWaypoint(group.candidates, currentTile, agentId);
        if (wp) return wp;
        break;
      }
    }
    // Fallback: pick from all candidates
    return pickNearestAvailableWaypoint(allCandidates, currentTile, agentId);
  }

  // No home base: pick randomly from all chair types (spread agents around)
  const roll = Math.random();
  let threshold = 0;
  const groups = [
    { weight: 0.35, candidates: waypoints.desks },
    { weight: 0.30, candidates: waypoints.receptionChairs },
    { weight: 0.25, candidates: waypoints.restRoomChairs },
    { weight: 0.10, candidates: waypoints.waterDispenser },
  ];
  for (const group of groups) {
    threshold += group.weight;
    if (roll <= threshold) {
      const wp = pickNearestAvailableWaypoint(group.candidates, currentTile, agentId);
      if (wp) return wp;
      break;
    }
  }
  // Fallback: nearest from all
  return pickNearestAvailableWaypoint(allCandidates, currentTile, agentId);
};

const scheduleHomeBaseReturn = async (agentId: string) => {
  clearHomeBaseReturnTimer(agentId);

  const timer = setTimeout(async () => {
    homeBaseReturnTimers.delete(agentId);
    const movementState = useMovementStore.getState();
    await movementState.ensureInitialized();

    const { collisionMap, waypoints } = movementState;
    const agent = agentsStore.getState().agents.find((entry) => entry.id === agentId);
    const homeBase = AGENT_HOME_BASES[agentId];

    if (!collisionMap || !agent || !homeBase || agent.status !== 'idle' || agent.movementState === 'walking') {
      return;
    }

    const currentWaypoint = findWaypointById(waypoints, agent.claimedWaypointId);
    if (isAtHomeBaseWaypoint(agentId, currentWaypoint)) {
      return;
    }

    releaseWaypointClaim(waypoints, agentId);

    const currentTile = pixelToTile(agent.x, agent.y);
    const waypoint = pickHomeBaseWaypoint(agentId, currentTile, waypoints);

    if (!waypoint) {
      agentsStore.updateAgent({
        id: agentId,
        movementState: 'standing',
        claimedWaypointId: null,
        path: [],
        targetX: null,
        targetY: null,
      });
      return;
    }

    claimWaypoint(waypoint, agentId);

    const noGoTiles = createNoGoSet(waypoints);
    const path = findPath(currentTile, { x: waypoint.x, y: waypoint.y }, collisionMap, noGoTiles).slice(1);
    const destination = tileToPixelCenter(waypoint);

    if (path.length === 0 && (currentTile.x !== waypoint.x || currentTile.y !== waypoint.y)) {
      const nearestWalkable = findNearestWalkableTile(collisionMap, currentTile, noGoTiles);
      if (nearestWalkable) {
        const retryPath = findPath(nearestWalkable, { x: waypoint.x, y: waypoint.y }, collisionMap, noGoTiles).slice(1);
        if (retryPath.length > 0) {
          const snappedPixel = tileToPixelCenter(nearestWalkable);
          agentsStore.updateAgent({
            id: agentId,
            status: 'idle',
            movementState: 'walking',
            x: snappedPixel.x,
            y: snappedPixel.y,
            claimedWaypointId: waypoint.id,
            visualOffsetX: 0,
            visualOffsetY: 0,
            path: retryPath,
            targetX: destination.x,
            targetY: destination.y,
            direction: waypoint.direction ?? agent.direction,
          });
          return;
        }
      }

      waypoint.claimedBy = null;
      agentsStore.updateAgent({
        id: agentId,
        movementState: 'standing',
        claimedWaypointId: null,
        path: [],
        targetX: null,
        targetY: null,
      });
      return;
    }

    agentsStore.updateAgent({
      id: agentId,
      status: 'idle',
      movementState: path.length === 0 ? 'seated-idle' : 'walking',
      claimedWaypointId: waypoint.id,
      visualOffsetX: path.length === 0 ? (waypoint.visualOffsetX ?? 0) : 0,
      visualOffsetY: path.length === 0 ? (waypoint.visualOffsetY ?? 0) : 0,
      path,
      targetX: path.length === 0 ? null : destination.x,
      targetY: path.length === 0 ? null : destination.y,
      direction: waypoint.direction ?? agent.direction,
      x: path.length === 0 ? destination.x : agent.x,
      y: path.length === 0 ? destination.y : agent.y,
    });
  }, HOME_BASE_RETURN_DELAY_MS);

  homeBaseReturnTimers.set(agentId, timer);
};

const seatedStateForStatus = (status: AgentStatus, type: WaypointClaim['type'] | null): MovementState => {
  if (status === 'conference' || type === 'conference') {
    return 'seated-conference';
  }
  if (type === 'watercooler') {
    return 'at-watercooler';
  }
  if (type === 'reception') {
    return 'seated-idle';
  }
  if (status === 'working') {
    return 'seated-working';
  }
  // 'idle' and 'online' are functionally the same — agent is at a seat
  if (type === 'restroom' || status === 'idle' || status === 'online') {
    return 'seated-idle';
  }
  return 'standing';
};

const nextStandingDirection = (direction?: Direction) => direction ?? 'south';

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
  placeAgentsOnLoad: async (agents) => {
    await get().ensureInitialized();
    const { collisionMap, waypoints } = get();
    if (!collisionMap) {
      console.log(`[PixDash Debug] placeAgentsOnLoad: collision map not loaded`);
      return;
    }
    console.log(`[PixDash Debug] placeAgentsOnLoad: ${agents.length} agents`);

    for (const agent of agents) {
      const agentTile = pixelToTile(agent.x, agent.y);
      let waypoint: WaypointClaim | null = null;

      if (agent.status === 'idle' || agent.status === 'online') {
        waypoint = pickIdleWaypoint(agent.id, agentTile, waypoints);
      } else if (agent.status === 'working') {
        waypoint = pickNearestAvailableWaypoint(waypoints.desks, agentTile, agent.id);
      }

      if (!waypoint) {
        console.log('[PixDash Debug] placeAgentsOnLoad: no waypoint for', JSON.stringify({ agentId: agent.id, status: agent.status, tile: agentTile }));
        continue;
      }

      console.log('[PixDash Debug] placeAgentsOnLoad:', JSON.stringify({ agentId: agent.id, waypoint: { id: waypoint.id, x: waypoint.x, y: waypoint.y, type: waypoint.type, dir: waypoint.direction } }));

      claimWaypoint(waypoint, agent.id);
      const destination = tileToPixelCenter(waypoint);

      agentsStore.updateAgent({
        id: agent.id,
        x: destination.x,
        y: destination.y,
        direction: waypoint.direction ?? agent.direction,
        movementState: getArrivalStateForMovementType(waypoint.type),
        claimedWaypointId: waypoint.id,
            visualOffsetX: waypoint.visualOffsetX ?? 0,
            visualOffsetY: waypoint.visualOffsetY ?? 0,
        path: [],
        targetX: null,
        targetY: null,
      });

      if (agent.status === 'idle' || agent.status === 'online') {
        const homeBase = AGENT_HOME_BASES[agent.id];
        if (homeBase && !isAtHomeBaseWaypoint(agent.id, waypoint)) {
          void scheduleHomeBaseReturn(agent.id);
        } else {
          void scheduleIdleWander(agent.id);
        }
      }
    }
  },
  handleStatusChange: async (agentId, status) => {
    console.log('[PixDash Debug] handleStatusChange', JSON.stringify({ agentId, status }));
    await get().ensureInitialized();
    const { collisionMap, waypoints } = get();
    if (!collisionMap) {
      console.log(`[PixDash Debug] missing collision map`, { agentId, status });
      return;
    }

    const agent = agentsStore.getState().agents.find((entry) => entry.id === agentId);
    if (!agent) {
      console.log(`[PixDash Debug] missing agent`, { agentId, status });
      return;
    }

    clearHomeBaseReturnTimer(agentId);

    // Guard: only proceed if the status actually requires a change in behavior.
    // 'online' and 'busy' are functionally identical to 'idle' — don't move.
    if (status === 'online' || status === 'busy') {
      agentsStore.updateAgent({ id: agentId, status });
      return;
    }

    // If already in the correct seated state for this status, skip (heartbeat re-broadcast).
    const expectedSeated = seatedStateForStatus(status, null);
    if (agent.movementState === expectedSeated) {
      console.log('[PixDash Debug] skipping seated', JSON.stringify({ agentId, status, ms: agent.movementState }));
      return;
    }

    // Any seated state → idle: agent stays where they are, no teleport.
    // Wander timer will eventually move them. This covers:
    // seated-working → idle (finished task)
    // seated-conference → idle (conference ended)
    // at-watercooler → idle (water break done)
    // seated-bio → idle (restroom done)
    // seated-idle → idle (heartbeat re-broadcast)
    if (status === 'idle' && agent.movementState?.startsWith('seated')) {
      agentsStore.updateAgent({ id: agentId, status, movementState: 'seated-idle' });
      // Re-schedule wander if it was cleared (e.g., agent was working)
      void scheduleIdleWander(agentId);
      return;
    }
    if (status === 'idle' && agent.movementState === 'at-watercooler') {
      agentsStore.updateAgent({ id: agentId, status, movementState: 'seated-idle' });
      void scheduleIdleWander(agentId);
      return;
    }

    // Only release waypoint if the agent needs a different seat for this status.
    // idle/online: handled by early return above, never reaches here
    // working: needs a desk
    // conference: needs a conference chair
    // offline: clears everything
    const needsNewSeat = status === 'offline' || status === 'conference' || status === 'working';

    if (needsNewSeat) {
      releaseWaypointClaim(waypoints, agentId);
      clearWanderTimer(agentId);
    }

    if (status === 'offline') {
      agentsStore.updateAgent({
        id: agentId,
        status,
        movementState: 'standing',
        claimedWaypointId: null,
        path: [],
        targetX: null,
        targetY: null,
      });
      return;
    }

    const currentTile = pixelToTile(agent.x, agent.y);
    const agentTileWalkable = isWalkableTile(collisionMap, currentTile.x, currentTile.y);
    console.log('[PixDash Debug] agent tile', JSON.stringify({
      agentId,
      status,
      position: { x: agent.x, y: agent.y },
      tile: currentTile,
      walkable: agentTileWalkable,
    }));

    let waypoint: WaypointClaim | null = null;

    if (status === 'working') {
      waypoint = pickNearestAvailableWaypoint(waypoints.desks, currentTile, agentId);
      if (!waypoint && waypoints.desks.length > 0) {
        waypoint = [...waypoints.desks].sort(
          (left, right) => distanceBetweenTiles(currentTile, left) - distanceBetweenTiles(currentTile, right),
        )[0] ?? null;
      }
    } else if (status === 'conference') {
      waypoint = pickNearestAvailableWaypoint(waypoints.conferenceRoomChairs, currentTile, agentId);
    } else if (status === 'idle' || status === 'online') {
      waypoint = pickIdleWaypoint(agentId, currentTile, waypoints);
    }

    if (!waypoint) {
      console.log('[PixDash Debug] no waypoint', JSON.stringify({ agentId, status, tile: currentTile }));
      agentsStore.updateAgent({
        id: agentId,
        status,
        movementState: 'standing',
        claimedWaypointId: null,
        path: [],
        targetX: null,
        targetY: null,
      });
      return;
    }

    claimWaypoint(waypoint, agentId);
    const waypointWalkable = isWalkableTile(collisionMap, waypoint.x, waypoint.y);
    const noGoTiles = createNoGoSet(waypoints);
    const path = findPath(currentTile, { x: waypoint.x, y: waypoint.y }, collisionMap, noGoTiles).slice(1);
    const destination = tileToPixelCenter(waypoint);
    console.log('[PixDash Debug] path result', JSON.stringify({
      agentId,
      status,
      waypoint: { id: waypoint.id, x: waypoint.x, y: waypoint.y, type: waypoint.type },
      waypointWalkable,
      pathLength: path.length,
      hasPath: path.length > 0,
    }));

    if (path.length === 0 && (currentTile.x !== waypoint.x || currentTile.y !== waypoint.y)) {
      const nearestWalkable = findNearestWalkableTile(collisionMap, currentTile, noGoTiles);
      if (nearestWalkable) {
        const retryPath = findPath(nearestWalkable, { x: waypoint.x, y: waypoint.y }, collisionMap, noGoTiles).slice(1);
        if (retryPath.length > 0) {
          // Build a smooth path from current pixel position through walkable tile to destination
          // Agent walks from their current visual position — no snap/teleport
          const pathWithOrigin = [
            { x: nearestWalkable.x, y: nearestWalkable.y },
            ...retryPath,
          ];
          agentsStore.updateAgent({
            id: agentId, status, movementState: 'walking',
            x: agent.x, y: agent.y, // Keep current pixel position
            claimedWaypointId: waypoint.id, path: pathWithOrigin,
            targetX: destination.x, targetY: destination.y,
            direction: waypoint.direction ?? agent.direction,
          });
          return;
        }
      }

      console.log('[PixDash Debug] empty path', JSON.stringify({
        agentId,
        status,
        from: currentTile,
        to: { x: waypoint.x, y: waypoint.y },
        agentTileWalkable,
        waypointWalkable,
      }));
      waypoint.claimedBy = null;
      agentsStore.updateAgent({
        id: agentId,
        status,
        movementState: 'standing',
        claimedWaypointId: null,
        path: [],
        targetX: null,
        targetY: null,
      });
      return;
    }

    const nextState = path.length === 0 ? seatedStateForStatus(status, waypoint.type) : 'walking';
    // Only apply visual offset when arriving at destination (not while walking)
    const isArriving = path.length === 0;
    agentsStore.updateAgent({
      id: agentId,
      status,
      movementState: nextState,
      claimedWaypointId: waypoint.id,
      ...(isArriving ? { visualOffsetX: waypoint.visualOffsetX ?? 0, visualOffsetY: waypoint.visualOffsetY ?? 0 } : { visualOffsetX: 0, visualOffsetY: 0 }),
      path,
      targetX: destination.x,
      targetY: destination.y,
      direction: waypoint.direction ?? agent.direction,
      x: path.length === 0 ? destination.x : agent.x,
      y: path.length === 0 ? destination.y : agent.y,
    });

    const homeBase = AGENT_HOME_BASES[agentId];
    const isAwayFromHome = status === 'idle' && homeBase && !isAtHomeBaseWaypoint(agentId, waypoint);
    if (isAwayFromHome) {
      void scheduleHomeBaseReturn(agentId);
    }
  },
  handleConference: async (agentIds) => {
    for (const agentId of agentIds) {
      await get().handleStatusChange(agentId, 'conference');
    }
  },
  removeAgent: (agentId) => {
    clearHomeBaseReturnTimer(agentId);
    clearWanderTimer(agentId);
    releaseWaypointClaim(get().waypoints, agentId);
  },
  tick: (deltaMs) => {
    const { waypoints } = get();
    const agents = agentsStore.getState().agents;

    for (const agent of agents) {
      if (agent.movementState !== 'walking') {
        continue;
      }

      const moved = advanceAgentAlongPath(agent, deltaMs);
      const waypoint = findWaypointById(waypoints, agent.claimedWaypointId);

      if ((moved.path?.length ?? 0) === 0) {
        const destination = waypoint ? tileToPixelCenter(waypoint) : { x: moved.x, y: moved.y };
        agentsStore.updateAgent({
          id: agent.id,
          x: destination.x,
          y: destination.y,
          path: [],
          targetX: null,
          targetY: null,
          direction: waypoint?.direction ?? nextStandingDirection(moved.direction),
          movementState: waypoint ? getArrivalStateForMovementType(waypoint.type) : 'standing',
          visualOffsetX: waypoint?.visualOffsetX ?? 0,
          visualOffsetY: waypoint?.visualOffsetY ?? 0,
        });

        const homeBase = AGENT_HOME_BASES[agent.id];
        if (agent.status !== 'idle') {
          clearHomeBaseReturnTimer(agent.id);
          clearWanderTimer(agent.id);
        } else if (homeBase && waypoint && !isAtHomeBaseWaypoint(agent.id, waypoint)) {
          clearWanderTimer(agent.id);
          void scheduleHomeBaseReturn(agent.id);
        } else {
          clearHomeBaseReturnTimer(agent.id);
          void scheduleIdleWander(agent.id);
        }
        continue;
      }

      agentsStore.updateAgent({
        id: agent.id,
        x: moved.x,
        y: moved.y,
        path: moved.path,
        targetX: moved.targetX,
        targetY: moved.targetY,
        direction: moved.direction,
        movementState: 'walking',
      });
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
