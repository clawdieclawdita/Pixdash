import type { AgentStatus } from '@pixdash/shared';
import type { BackendWaypoint, BackendWaypointType } from '../data/waypoints.js';
import { findPath } from './PathfindingService.js';
import type { AgentStateManager } from './AgentStateManager.js';

const WANDER_DELAY_MIN_MS = 60_000;
const WANDER_DELAY_MAX_MS = 90_000;
const WANDER_WEIGHTS: Array<{ type: BackendWaypointType; weight: number }> = [
  { type: 'desk', weight: 35 },
  { type: 'reception', weight: 30 },
  { type: 'restroom', weight: 20 },
  { type: 'dining', weight: 15 },
];

const SEATED_TYPES = new Set<BackendWaypointType>(['desk', 'reception', 'restroom', 'conference', 'dining']);
const TICK_INTERVAL_MS = 50;
const MOVEMENT_SPEED_TILES_PER_SECOND = 5;
const PROGRESS_INCREMENT = (TICK_INTERVAL_MS / 1000) * MOVEMENT_SPEED_TILES_PER_SECOND;

export class MovementEngine {
  private readonly wanderDueAt = new Map<string, number>();
  /** Tiles currently occupied by non-moving agents (seated/idle). Moving agents are tracked separately. */
  private readonly occupiedTiles = new Map<string, string>(); // "x,y" -> agentId

  constructor(
    private readonly walkable: boolean[][],
    private readonly waypoints: BackendWaypoint[],
    private readonly noGoTiles: Set<string>,
    private readonly agentStateManager: AgentStateManager,
  ) {}

  /**
   * Record an agent as occupying a tile. Removes any previous tile for that agent.
   */
  private setOccupied(agentId: string, x: number, y: number): void {
    // Remove previous tile
    for (const [key, id] of this.occupiedTiles) {
      if (id === agentId) {
        this.occupiedTiles.delete(key);
        break;
      }
    }
    this.occupiedTiles.set(`${x},${y}`, agentId);
  }

  /**
   * Remove an agent's tile occupancy.
   */
  private clearOccupied(agentId: string): void {
    for (const [key, id] of this.occupiedTiles) {
      if (id === agentId) {
        this.occupiedTiles.delete(key);
        break;
      }
    }
  }

  /**
   * Check if a tile is occupied by another agent.
   */
  private isTileOccupiedByOther(x: number, y: number, agentId: string): boolean {
    const occupant = this.occupiedTiles.get(`${x},${y}`);
    return occupant !== undefined && occupant !== agentId;
  }

  /**
   * Rebuild the occupied-tiles map from current agent state.
   * Called periodically to stay in sync.
   */
  syncOccupancy(): void {
    this.occupiedTiles.clear();
    for (const agent of this.agentStateManager.getMutableAgents()) {
      // Only track non-moving agents as tile occupants
      if (agent.movement?.status !== 'moving') {
        this.occupiedTiles.set(`${agent.position.x},${agent.position.y}`, agent.id);
      }
    }
  }

  handleStatusChange(agentId: string, newStatus: AgentStatus, previousStatus: AgentStatus): void {
    if (newStatus === previousStatus) {
      return;
    }

    if (newStatus === 'offline') {
      this.cancelMovement(agentId, true);
      return;
    }

    if (newStatus === 'conference') {
      return;
    }

    if (newStatus === 'working') {
      const agent = this.agentStateManager.getMutableAgent(agentId);
      const currentWaypoint = agent?.movement?.claimedWaypointId
        ? this.agentStateManager.findWaypointById(agent.movement.claimedWaypointId)
        : null;
      // Already seated at a desk — stay put (no reroute needed)
      if (currentWaypoint?.type === 'desk' && agent?.movement?.status === 'seated') {
        return;
      }
      const reserved = this.findReservedWaypoint(agentId);
      if (reserved) {
        if (!this.routeAgentToWaypoint(agentId, reserved)) {
          // Reserved seat unreachable — fall through to regular desk
          this.routeToCategory(agentId, 'desk');
        }
      } else {
        this.routeToCategory(agentId, 'desk');
      }
      return;
    }

    if (newStatus === 'online') {
      const agent = this.agentStateManager.getMutableAgent(agentId);
      const seatedWaypoint = agent?.movement?.claimedWaypointId
        ? this.agentStateManager.findWaypointById(agent.movement.claimedWaypointId)
        : null;
      // Already seated anywhere — stay put
      if (seatedWaypoint && agent?.movement?.status === 'seated') {
        return;
      }
      const reserved = this.findReservedWaypoint(agentId);
      if (reserved) {
        if (!this.routeAgentToWaypoint(agentId, reserved)) {
          this.routeToCategory(agentId, 'desk');
        }
      } else {
        this.routeToCategory(agentId, 'desk');
      }
      return;
    }

    if (newStatus === 'idle') {
      this.scheduleWander(agentId);
    }
  }

  handleConference(agentIds: string[]): void {
    const conferenceSeats = this.waypoints.filter((waypoint) => waypoint.type === 'conference');
    const targetedIds = this.collectTargetedWaypointIds();

    for (const agentId of agentIds) {
      this.cancelMovement(agentId, true);
      const seat = this.pickWaypoint(conferenceSeats, agentId, targetedIds);
      if (!seat) {
        continue;
      }
      if (this.routeAgentToWaypoint(agentId, seat)) {
        targetedIds.add(seat.id);
        const agent = this.agentStateManager.getMutableAgent(agentId);
        if (agent) {
          agent.status = 'conference';
        }
      }
    }
  }

  wanderTick(): void {
    const now = Date.now();
    // Keep occupancy map in sync with current agent state
    this.syncOccupancy();
    this.validatePositions();
    for (const agent of this.agentStateManager.getMutableAgents()) {
      if (agent.status !== 'idle') {
        continue;
      }
      const dueAt = this.wanderDueAt.get(agent.id);
      if (!dueAt || dueAt > now) {
        continue;
      }
      this.wanderDueAt.delete(agent.id);
      this.routeIdleAgent(agent.id);
    }
  }

  movementTick(): void {
    this.wanderTick();

    for (const agent of this.agentStateManager.getMutableAgents()) {
      const movement = agent.movement;
      if (!movement || movement.path.length === 0) {
        continue;
      }

      const waypoint = movement.claimedWaypointId ? this.agentStateManager.findWaypointById(movement.claimedWaypointId) : null;
      let progress = (movement.progress ?? 0) + PROGRESS_INCREMENT;
      let path = [...movement.path];
      let currentPosition = { ...agent.position };

      // Stale path guard: if first step is not adjacent to current position,
      // the path was generated from a different location. Cancel movement.
      if (path.length > 0) {
        const firstStep = path[0];
        const dist = Math.abs(currentPosition.x - firstStep.x) + Math.abs(currentPosition.y - firstStep.y);
        if (dist > 1) {
          // Path is stale — cancel and release
          this.clearOccupied(agent.id);
          if (movement.claimedWaypointId) {
            this.agentStateManager.releaseWaypointClaim(movement.claimedWaypointId, agent.id);
          }
          agent.movement = {
            ...movement,
            status: 'idle',
            path: [],
            progress: 0,
            fractionalX: undefined,
            fractionalY: undefined,
            lastUpdatedAt: new Date().toISOString(),
          };
          this.agentStateManager.emitMovement(agent);
          continue;
        }
      }

      while (progress >= 1 && path.length > 0) {
        const [nextStep, ...remainingPath] = path;
        const direction = this.agentStateManager.directionFromStep(currentPosition, nextStep);
        currentPosition = {
          x: nextStep.x,
          y: nextStep.y,
          direction,
        };
        path = remainingPath;
        progress -= 1;
      }

      const nextStep = path[0];
      const arrived = path.length === 0;

      // While moving, clear our old tile occupancy (we're transient)
      if (!arrived) {
        this.clearOccupied(agent.id);
      }

      // Check if next step is occupied by another stationary agent — pause if so
      if (!arrived && nextStep && this.isTileOccupiedByOther(nextStep.x, nextStep.y, agent.id)) {
        // Don't advance — wait for the tile to clear, but update position to last valid step
        agent.position = currentPosition;
        agent.movement = {
          ...movement,
          progress: 0,
          lastUpdatedAt: new Date().toISOString(),
        };
        this.agentStateManager.emitMovement(agent);
        continue;
      }

      agent.position = currentPosition;

      if (!arrived && nextStep) {
        agent.position.direction = this.agentStateManager.directionFromStep(agent.position, nextStep);
      }

      // On arrival, face the waypoint direction (desk chair, reception seat, etc.)
      if (arrived && waypoint) {
        agent.position.direction = waypoint.direction;
      }

      agent.movement = {
        ...movement,
        status: arrived && waypoint && SEATED_TYPES.has(waypoint.type) ? 'seated' : arrived ? 'idle' : 'moving',
        path,
        progress: arrived ? 0 : progress,
        fractionalX: arrived || !nextStep ? undefined : agent.position.x + (nextStep.x - agent.position.x) * progress,
        fractionalY: arrived || !nextStep ? undefined : agent.position.y + (nextStep.y - agent.position.y) * progress,
        lastUpdatedAt: new Date().toISOString(),
        visualOffsetX: waypoint?.visualOffsetX,
        visualOffsetY: waypoint?.visualOffsetY,
        waypointType: waypoint?.type,
        waypointDirection: arrived ? waypoint?.direction : undefined,
      };

      this.agentStateManager.emitMovement(agent);

      if (arrived) {
        // Mark the arrival tile as occupied
        this.setOccupied(agent.id, agent.position.x, agent.position.y);

        if (agent.status === 'idle') {
          this.scheduleWander(agent.id);
        }
      }
    }
  }

  private findReservedWaypoint(agentId: string): BackendWaypoint | null {
    return this.waypoints.find((wp) => wp.reservedFor === agentId) ?? null;
  }

  requestMove(agentId: string, waypointId?: string, destination?: { x: number; y: number }) {
    const targetWaypoint = waypointId ? this.agentStateManager.findWaypointById(waypointId) : null;
    if (targetWaypoint) {
      const ok = this.routeAgentToWaypoint(agentId, targetWaypoint);
      if (!ok) {
        throw new Error(`no backend path available from current position to waypoint ${targetWaypoint.id}`);
      }
      return;
    }

    if (!destination) {
      throw new Error('destination or waypointId is required');
    }

    const agent = this.agentStateManager.getMutableAgent(agentId);
    if (!agent) {
      throw new Error(`agent ${agentId} not found`);
    }
    if (!this.walkable[destination.y]?.[destination.x]) {
      throw new Error(`destination ${destination.x},${destination.y} is not walkable`);
    }

    const path = findPath({ x: agent.position.x, y: agent.position.y }, destination, this.walkable, this.noGoTiles);
    if ((agent.position.x !== destination.x || agent.position.y !== destination.y) && path.length === 0) {
      throw new Error(`no backend path available from ${agent.position.x},${agent.position.y} to ${destination.x},${destination.y}`);
    }

    this.cancelMovement(agentId, true);
    this.agentStateManager.applyMovement(agent, path.slice(1), null, destination);
  }

  private routeIdleAgent(agentId: string): void {
    const agent = this.agentStateManager.getMutableAgent(agentId);
    if (!agent) {
      return;
    }
    if (agent.movement?.claimedWaypointId) {
      this.agentStateManager.releaseWaypointClaim(agent.movement.claimedWaypointId, agentId);
    }

    const choice = this.pickWeightedCategory();
    const routed = this.routeToCategory(agentId, choice);
    if (!routed) {
      // All waypoints in this category are occupied — try other categories
      const otherCategories = WANDER_WEIGHTS.filter(w => w.type !== choice).map(w => w.type);
      for (const fallback of otherCategories) {
        if (this.routeToCategory(agentId, fallback)) {
          return;
        }
      }
      // Truly nowhere to go — reschedule later
      this.scheduleWander(agentId);
    }
  }

  private routeToCategory(agentId: string, type: BackendWaypointType): boolean {
    const candidates = this.waypoints.filter((waypoint) => waypoint.type === type);
    const targetedIds = this.collectTargetedWaypointIds();
    const waypoint = this.pickWaypoint(candidates, agentId, targetedIds);
    if (!waypoint) {
      return false;
    }
    return this.routeAgentToWaypoint(agentId, waypoint);
  }

  private routeAgentToWaypoint(agentId: string, waypoint: BackendWaypoint): boolean {
    const agent = this.agentStateManager.getMutableAgent(agentId);
    if (!agent) {
      return false;
    }

    const path = findPath(
      { x: agent.position.x, y: agent.position.y },
      { x: waypoint.x, y: waypoint.y },
      this.walkable,
      this.noGoTiles,
    );

    if ((agent.position.x !== waypoint.x || agent.position.y !== waypoint.y) && path.length === 0) {
      return false;
    }

    this.cancelMovement(agentId, true);
    this.agentStateManager.claimWaypoint(waypoint, agentId);
    this.agentStateManager.applyMovement(agent, path.slice(1), waypoint, { x: waypoint.x, y: waypoint.y });
    this.wanderDueAt.delete(agentId);
    return true;
  }

  private cancelMovement(agentId: string, releaseWaypoint: boolean): void {
    this.wanderDueAt.delete(agentId);
    const agent = this.agentStateManager.getMutableAgent(agentId);
    if (!agent?.movement) {
      return;
    }

    if (releaseWaypoint && agent.movement.claimedWaypointId) {
      this.agentStateManager.releaseWaypointClaim(agent.movement.claimedWaypointId, agentId);
    }

    // Mark current position as occupied if we were moving
    if (agent.movement.status === 'moving') {
      this.setOccupied(agentId, agent.position.x, agent.position.y);
    }

    agent.movement = {
      ...agent.movement,
      status: 'idle',
      claimedWaypointId: releaseWaypoint ? null : agent.movement.claimedWaypointId,
      destination: null,
      path: [],
      progress: 0,
      fractionalX: undefined,
      fractionalY: undefined,
      lastUpdatedAt: new Date().toISOString(),
      visualOffsetX: undefined,
      visualOffsetY: undefined,
      waypointType: undefined,
      waypointDirection: undefined,
    };
    this.agentStateManager.emitMovement(agent);
  }

  scheduleWander(agentId: string): void {
    const delay = WANDER_DELAY_MIN_MS + Math.floor(Math.random() * (WANDER_DELAY_MAX_MS - WANDER_DELAY_MIN_MS + 1));
    this.wanderDueAt.set(agentId, Date.now() + delay);
  }

  /**
   * Validate all agent positions. If any agent is on a non-walkable tile
   * and not currently mid-path, snap them to the nearest walkable tile.
   */
  private validatePositions(): void {
    for (const agent of this.agentStateManager.getMutableAgents()) {
      // Skip agents actively stepping through a path — they may
      // briefly pass through tiles that appear blocked due to rounding,
      // but pathfinding guarantees the full path is valid.
      if (agent.movement?.status === 'moving' && (agent.movement?.path?.length ?? 0) > 0) {
        continue;
      }

      const { x, y } = agent.position;
      if (x >= 0 && y >= 0 && this.walkable[y]?.[x]) {
        continue; // Position is valid
      }

      // Find nearest walkable tile via BFS
      const nearest = this.findNearestWalkable(x, y);
      if (nearest) {
        agent.position.x = nearest.x;
        agent.position.y = nearest.y;
        this.agentStateManager.emitMovement(agent);
      }
    }
  }

  private findNearestWalkable(startX: number, startY: number): { x: number; y: number } | null {
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
    visited.add(`${startX},${startY}`);
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [dx, dy] of dirs) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (nx < 0 || ny < 0 || ny >= this.walkable.length || nx >= (this.walkable[0]?.length ?? 0)) {
          continue;
        }
        const key = `${nx},${ny}`;
        if (visited.has(key)) {
          continue;
        }
        visited.add(key);
        if (this.walkable[ny][nx]) {
          return { x: nx, y: ny };
        }
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  private collectTargetedWaypointIds(): Set<string> {
    const targeted = new Set<string>();
    for (const agent of this.agentStateManager.getMutableAgents()) {
      if (agent.movement?.status === 'moving' && agent.movement.claimedWaypointId) {
        targeted.add(agent.movement.claimedWaypointId);
      }
    }
    return targeted;
  }

  private pickWaypoint(candidates: BackendWaypoint[], agentId: string, excludeIds: Set<string>): BackendWaypoint | null {
    const agent = this.agentStateManager.getMutableAgent(agentId);
    if (!agent) {
      return null;
    }

    const available = candidates.filter((waypoint) => {
      if (waypoint.reservedFor && waypoint.reservedFor !== agentId) {
        return false;
      }
      if (excludeIds.has(waypoint.id)) {
        return false;
      }
      if (!waypoint.claimedBy || waypoint.claimedBy === agentId) {
        return true;
      }
      return false;
    });

    if (available.length === 0) {
      return null;
    }

    const sorted = [...available].sort((left, right) => {
      const leftDistance = Math.abs(left.x - agent.position.x) + Math.abs(left.y - agent.position.y);
      const rightDistance = Math.abs(right.x - agent.position.x) + Math.abs(right.y - agent.position.y);
      return leftDistance - rightDistance;
    });

    // Filter out waypoints whose tile is occupied by another agent
    const unoccupied = sorted.filter(wp => !this.isTileOccupiedByOther(wp.x, wp.y, agentId));
    const pool = unoccupied.length > 0 ? unoccupied : sorted;
    const top = pool.slice(0, Math.min(pool.length, 5));
    return top[Math.floor(Math.random() * top.length)] ?? null;
  }

  private pickWeightedCategory(): BackendWaypointType {
    const total = WANDER_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;

    for (const entry of WANDER_WEIGHTS) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.type;
      }
    }

    return 'desk';
  }
}
