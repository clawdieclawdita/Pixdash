import { EventEmitter } from 'node:events';
import type { Agent, AgentLog, AgentTask, Appearance, AppearancePatch, FrontendEventName, FrontendEventPayload, MoveAgentRequest, MovementAuthorityState, Tilemap } from '@pixdash/shared';
import { DEFAULT_APPEARANCE } from '@pixdash/shared';
import type { BackendWaypoint } from '../data/waypoints.js';
import { cloneBackendWaypoints } from '../data/waypoints.js';
import { createNoGoTiles } from '../data/noGoTiles.js';
import type { ActiveMeeting, ActiveMeetingSnapshot, ConfigAgentSnapshot, GatewayConferenceEvent, GatewayLogEvent, GatewayStatusEvent, GatewayTaskEvent } from '../types/index.js';
import { AppearanceStore } from './AppearanceStore.js';
import { MovementEngine } from './MovementEngine.js';

const RANDOM_BODY_TYPES = ['michael', 'angela', 'phillis', 'creed', 'ryan', 'pam', 'kelly', 'kate', 'pites', 'jim', 'clawdie'] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function randomBodyTypeForAgent(agentId: string): import('@pixdash/shared').BodyType {
  return RANDOM_BODY_TYPES[hashString(agentId) % RANDOM_BODY_TYPES.length];
}

import { pixdashConfig } from '../config/pixdashConfig.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('trace');

function derivePosition(_id: string) {
  const spawnPositions = pixdashConfig.getSpawnPositions();
  const index = Math.floor(Math.random() * spawnPositions.length);
  const spawnPos = spawnPositions[index];
  // Hardening: reject near-origin coordinates (indicates corruption)
  if (!spawnPos || spawnPos.x < 3 || spawnPos.y < 10) {
    logger.warn({ agentId: _id, spawnPos, index }, '[derivePosition] suspicious spawn position — using safe fallback');
    const fallback = pixdashConfig.getSpawnPositions()[0] ?? { x: 31, y: 22 };
    return { x: fallback.x, y: fallback.y, direction: 'south' as const };
  }
  return {
    x: spawnPos.x,
    y: spawnPos.y,
    direction: 'south' as const,
  };
}

const IDLE_THRESHOLD_MS = 300_000;
const WORKING_GRACE_MS = 10_000;
const STATUS_REEVALUATION_INTERVAL_MS = 30_000;
const MOVEMENT_TICK_INTERVAL_MS = 50;
const MEETING_INACTIVITY_THRESHOLD_MS = 60_000;
const MEETING_CHECK_INTERVAL_MS = 15_000;
const TILE_SIZE_PX = 32;
const TILE_CENTER_OFFSET_PX = TILE_SIZE_PX / 2;

function createInitialMovementState(): MovementAuthorityState {
  return {
    status: 'idle',
    claimedWaypointId: null,
    destination: null,
    path: [],
    lastUpdatedAt: new Date().toISOString(),
    progress: 0,
  };
}

type AgentPresenceState = {
  explicitOffline: boolean;
  baselineStatus: 'online' | 'idle';
  lastActivityAt?: number;
};

type StatefulAgent = Agent & {
  displayName?: string;
};

function createInitialAgent(id: string, name = id): StatefulAgent {
  return {
    id,
    name,
    status: 'idle',
    lastSeen: new Date().toISOString(),
    position: derivePosition(id) ?? (() => { const fb = pixdashConfig.getSpawnPositions()[0] ?? { x: 31, y: 22 }; return { x: fb.x, y: fb.y, direction: 'south' as const }; })(),
    appearance: { ...structuredClone(DEFAULT_APPEARANCE), bodyType: randomBodyTypeForAgent(id) },
    config: {},
    stats: {
      messagesProcessed: 0,
      tasksCompleted: 0,
      uptimeSeconds: 0,
    },
    logs: [],
    tasks: [],
  };
}

export class AgentStateManager {
  private readonly agents = new Map<string, StatefulAgent>();
  private readonly events = new EventEmitter();
  private readonly presence = new Map<string, AgentPresenceState>();
  private readonly activityDecayTimers = new Map<string, NodeJS.Timeout>();
  private readonly movementInterval: NodeJS.Timeout;
  private readonly statusInterval: NodeJS.Timeout;
  private readonly settledBroadcastInterval: NodeJS.Timeout;
  private readonly lastMovementBroadcast = new Map<string, number>();
  private readonly waypoints: BackendWaypoint[];
  private readonly gridWidth: number;
  private readonly gridHeight: number;
  private readonly movementEngine: MovementEngine;
  private readonly activeMeetings = new Map<string, ActiveMeeting>();
  private readonly meetingCheckInterval: NodeJS.Timeout;

  constructor(private readonly appearanceStore: AppearanceStore, officeLayout: Tilemap) {
    this.waypoints = cloneBackendWaypoints();
    this.gridWidth = officeLayout.width;
    this.gridHeight = officeLayout.height;
    this.movementEngine = new MovementEngine(
      officeLayout.walkable ?? [],
      this.waypoints,
      createNoGoTiles(this.waypoints),
      this,
    );

    this.movementInterval = setInterval(() => {
      this.movementEngine.movementTick();
    }, MOVEMENT_TICK_INTERVAL_MS);
    this.movementInterval.unref?.();

    this.statusInterval = setInterval(() => {
      this.reevaluateStatuses();
    }, STATUS_REEVALUATION_INTERVAL_MS);
    this.statusInterval.unref?.();

    this.settledBroadcastInterval = setInterval(() => {
      this.broadcastSettledStates();
    }, 5_000);
    this.settledBroadcastInterval.unref?.();

    this.meetingCheckInterval = setInterval(() => {
      this.checkMeetingInactivity();
    }, MEETING_CHECK_INTERVAL_MS);
    this.meetingCheckInterval.unref?.();
  }

  /** Remove an agent and all associated state. Safe to call multiple times. */
  removeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      logger.info({ agentId: id, position: agent.position, status: agent.status, movementStatus: agent.movement?.status }, '[removeAgent] removing agent');
    }
    this.agents.delete(id);
    this.presence.delete(id);
    const timer = this.activityDecayTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.activityDecayTimers.delete(id);
    }
    this.lastMovementBroadcast.delete(id);
    this.movementEngine.removeAgent(id);
  }

  /** Gracefully shut down all intervals and timers. */
  shutdown(): void {
    clearInterval(this.movementInterval);
    clearInterval(this.statusInterval);
    clearInterval(this.settledBroadcastInterval);
    clearInterval(this.meetingCheckInterval);
    for (const timer of this.activityDecayTimers.values()) {
      clearTimeout(timer);
    }
    this.activityDecayTimers.clear();
  }

  async hydrateAppearance(agentId: string): Promise<void> {
    const agent = this.ensureAgent(agentId);
    agent.appearance = await this.appearanceStore.get(agentId);
    // If appearance store has no saved entry, use random bodyType
    if (!this.appearanceStore.hasSavedAppearance(agentId)) {
      agent.appearance.bodyType = randomBodyTypeForAgent(agentId);
    }
    // Resolve displayName: user-set > default map
    const savedDisplayName = await this.appearanceStore.getDisplayName(agentId, agent.name);
    const configName = pixdashConfig.getDisplayName(agentId, agent.name);
    agent.displayName = savedDisplayName !== agent.name ? savedDisplayName : configName;
  }

  subscribe(listener: (event: { event: FrontendEventName; payload: FrontendEventPayload }) => void): () => void {
    this.events.on('broadcast', listener);
    return () => this.events.off('broadcast', listener);
  }

  getAgents(): Agent[] {
    this.reevaluateStatuses();
    return [...this.agents.values()].map((agent) => structuredClone(agent)).sort((a, b) => a.name.localeCompare(b.name));
  }

  getAgent(id: string): Agent | undefined {
    this.reevaluateStatuses(id);
    const agent = this.agents.get(id);
    return agent ? structuredClone(agent) : undefined;
  }

  getLogs(id: string, options?: { limit?: number; offset?: number; level?: AgentLog['level'] }): { logs: AgentLog[]; total: number; hasMore: boolean } {
    const logs = this.ensureAgent(id).logs ?? [];
    const filtered = options?.level ? logs.filter((log: AgentLog) => log.level === options.level) : logs;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    const page = filtered.slice(offset, offset + limit);
    return {
      logs: structuredClone(page),
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
    };
  }

  getTasks(id: string): AgentTask[] {
    return structuredClone(this.ensureAgent(id).tasks ?? []);
  }

  async applyConfigSnapshot(snapshot: ConfigAgentSnapshot): Promise<void> {
    const agent = this.ensureAgent(snapshot.id, snapshot.name);
    agent.name = snapshot.name;
    agent.config = snapshot.config;
    agent.soul = snapshot.soul;
    agent.identity = snapshot.identity;
    agent.movement ??= createInitialMovementState();
    agent.appearance = await this.appearanceStore.get(snapshot.id);
    if (!this.appearanceStore.hasSavedAppearance(snapshot.id)) {
      agent.appearance.bodyType = randomBodyTypeForAgent(snapshot.id);
    }
    // Resolve displayName
    const savedDisplayName = await this.appearanceStore.getDisplayName(snapshot.id, snapshot.name);
    const configName = pixdashConfig.getDisplayName(snapshot.id, snapshot.name);
    agent.displayName = savedDisplayName !== snapshot.name ? savedDisplayName : configName;
    const safeAgent = structuredClone(agent) as unknown as Record<string, unknown>;
    delete safeAgent.soul;
    delete safeAgent.identity;
    const cfg = safeAgent.config as Record<string, unknown> | undefined;
    if (cfg) {
      delete cfg.workspace;
      delete cfg.agentDir;
      delete cfg.source;
      delete cfg.model;
    }
    this.broadcast('agent:config', { agentId: snapshot.id, agent: safeAgent } as unknown as FrontendEventPayload);
  }

  applyStatusEvent(event: GatewayStatusEvent): void {
    // Short-circuit: if this is an offline event for a non-existent agent,
    // there's nothing to remove. Avoid creating a new agent just to delete it.
    if (event.status === 'offline') {
      const existing = this.agents.get(event.agentId);
      if (!existing) return;
      const presence = this.ensurePresence(event.agentId);
      presence.explicitOffline = true;
      logger.info({ agentId: event.agentId, position: existing.position, movementStatus: existing.movement?.status, source: event.source }, '[applyStatusEvent] agent going offline — removing');
      this.removeAgent(event.agentId);
      return;
    }

    const agent = this.ensureAgent(event.agentId);
    const presence = this.ensurePresence(event.agentId);
    const previousStatus = agent.status;
    const inActiveMeeting = [...this.activeMeetings.values()].some((meeting) => meeting.agentIds.has(event.agentId));
    const isSyntheticSnapshot = event.source === 'presence_snapshot' || event.source === 'health_snapshot';
    const hasFreshActivity = typeof presence.lastActivityAt === 'number'
      && Math.max(0, Date.now() - presence.lastActivityAt) < WORKING_GRACE_MS;
    const shouldPreserveWorking = isSyntheticSnapshot && hasFreshActivity;

    if (!shouldPreserveWorking) {
      presence.explicitOffline = false;
      presence.baselineStatus = event.status === 'idle' ? 'idle' : 'online';
    }

    agent.lastSeen = event.timestamp;
    const derivedStatus = inActiveMeeting ? 'conference' : this.deriveStatus(event.agentId);
    agent.status = derivedStatus;

    if (agent.stats) {
      agent.stats.uptimeSeconds += 1;
    }

    this.broadcast('agent:status', {
      agentId: event.agentId,
      status: derivedStatus,
      timestamp: agent.lastSeen,
    });

    this.movementEngine.handleStatusChange(event.agentId, derivedStatus, previousStatus);
  }

  applyLogEvent(event: GatewayLogEvent): void {
    const agent = this.ensureAgent(event.agentId);
    const logs = agent.logs ?? [];
    logs.unshift(event.log);
    agent.logs = logs.slice(0, 100);
    if (agent.stats) {
      agent.stats.messagesProcessed += 1;
    }
    this.broadcast('agent:log', event);
  }

  applyTaskEvent(event: GatewayTaskEvent): void {
    const agent = this.ensureAgent(event.agentId);
    const tasks = agent.tasks ?? [];
    const index = tasks.findIndex((task: AgentTask) => task.id === event.task.id);
    if (index >= 0) {
      tasks[index] = event.task;
    } else {
      tasks.unshift(event.task);
    }
    agent.tasks = tasks.slice(0, 200);
    if (agent.stats && event.task.status === 'completed') {
      agent.stats.tasksCompleted += 1;
    }
    this.broadcast('agent:task', event);
  }

  applyConferenceEvent(event: GatewayConferenceEvent): void {
    const validAgentIds = event.agentIds.filter((id) => this.agents.has(id));
    logger.info({ sessionKey: event.sessionKey, source: event.source, agentIds: event.agentIds, validAgentIds }, '[applyConferenceEvent] received');
    if (validAgentIds.length < 2) {
      return;
    }

    const sessionKey = event.sessionKey ?? 'unknown';
    const source = event.source === 'sessions_spawn' || event.source === 'group_exchange'
      ? event.source
      : 'session_send';
    const timestamp = event.timestamp ?? new Date().toISOString();

    const meeting = this.createOrUpdateMeeting(validAgentIds, sessionKey, source);

    this.setConferenceStatus(validAgentIds, timestamp);
    this.movementEngine.handleConference(validAgentIds);

    this.broadcast('agent:conference', {
      agentIds: validAgentIds,
      sessionKey,
      source,
      timestamp,
    });

    if (meeting) {
      logger.info({ meetingId: meeting.id, agentIds: validAgentIds, sessionKey, source }, 'Conference meeting started');
      this.broadcast('agent:conference_start', {
        meetingId: meeting.id,
        agentIds: [...meeting.agentIds],
        sessionKey: meeting.sessionKey,
        source: meeting.source,
      });
    }
  }

  recordActivity(id: string, timestamp = Date.now()): void {
    const agent = this.ensureAgent(id);
    const presence = this.ensurePresence(id);
    const previousStatus = agent.status;
    const inActiveMeeting = [...this.activeMeetings.values()].some((meeting) => meeting.agentIds.has(id));

    presence.explicitOffline = false;
    presence.baselineStatus = 'online';
    presence.lastActivityAt = timestamp;
    agent.lastSeen = new Date(timestamp).toISOString();

    if (inActiveMeeting) {
      if (agent.status !== 'conference') {
        agent.status = 'conference';
        this.broadcast('agent:status', {
          agentId: id,
          status: 'conference',
          timestamp: agent.lastSeen,
        });
      }
      this.scheduleActivityDecay(id);
      return;
    }

    agent.status = 'working';
    this.broadcast('agent:status', {
      agentId: id,
      status: 'working',
      timestamp: agent.lastSeen,
    });
    this.scheduleActivityDecay(id);
    this.movementEngine.handleStatusChange(id, 'working', previousStatus);
  }

  async upsertAppearance(id: string, patch: AppearancePatch): Promise<Appearance> {
    const agent = this.ensureAgent(id);
    const updated = await this.appearanceStore.merge(id, patch);
    agent.appearance = updated;
    this.broadcast('agent:appearance', { agentId: id, appearance: updated });
    return structuredClone(updated);
  }

  async setDisplayName(id: string, name: string | null): Promise<string | null> {
    const agent = this.ensureAgent(id);
    const result = await this.appearanceStore.setDisplayName(id, name);
    // Re-resolve: user-set takes priority, fall back to default map
    if (result) {
      agent.displayName = result;
    } else {
      agent.displayName = pixdashConfig.getDisplayName(id, agent.name) ?? undefined;
    }
    this.broadcast('agent:config', { agentId: id, agent: structuredClone(agent) } as unknown as FrontendEventPayload);
    return result;
  }

  requestMove(request: MoveAgentRequest): { ok: true; agent: Agent } {
    const agentId = String(request.agentId ?? '');
    if (!agentId) {
      throw new Error('agentId is required');
    }

    this.ensureAgent(agentId);
    this.movementEngine.requestMove(agentId, request.waypointId, request.destination);
    const agent = this.ensureAgent(agentId);
    return { ok: true, agent: structuredClone(agent) };
  }

  getActiveMeetings(): ActiveMeetingSnapshot[] {
    const snapshots: ActiveMeetingSnapshot[] = [];
    for (const meeting of this.activeMeetings.values()) {
      snapshots.push({
        id: meeting.id,
        agentIds: [...meeting.agentIds],
        sessionKey: meeting.sessionKey,
        startedAt: new Date(meeting.startedAt).toISOString(),
        lastActivityAt: new Date(meeting.lastActivityAt).toISOString(),
        source: meeting.source,
      });
    }
    // Sort by most recently active first
    snapshots.sort((a, b) => {
      const timeA = new Date(a.lastActivityAt).getTime();
      const timeB = new Date(b.lastActivityAt).getTime();
      return timeB - timeA;
    });
    return snapshots;
  }

  getMutableAgents(): StatefulAgent[] {
    return [...this.agents.values()];
  }

  getMutableAgent(id: string): StatefulAgent | undefined {
    return this.agents.get(id);
  }

  isKnownAgent(id: string): boolean {
    return this.agents.has(id);
  }

  findWaypointById(waypointId: string | null | undefined): BackendWaypoint | null {
    if (!waypointId) {
      return null;
    }
    return this.waypoints.find((waypoint) => waypoint.id === waypointId) ?? null;
  }

  claimWaypoint(waypoint: BackendWaypoint, agentId: string): void {
    waypoint.claimedBy = agentId;
  }

  releaseWaypointClaim(waypointId: string | null | undefined, agentId: string): void {
    if (!waypointId) {
      return;
    }
    const waypoint = this.findWaypointById(waypointId);
    if (waypoint?.claimedBy === agentId) {
      waypoint.claimedBy = null;
    }
  }

  applyMovement(agent: Agent, path: Array<{ x: number; y: number }>, waypoint: BackendWaypoint | null, destination: { x: number; y: number }): void {
    const nextDirection = path.length > 0 ? this.directionFromStep(agent.position, path[0]) : waypoint?.direction ?? agent.position.direction ?? 'south';
    agent.position.direction = nextDirection;
    agent.movement = {
      status: path.length > 0 ? 'moving' : waypoint ? 'seated' : 'idle',
      claimedWaypointId: waypoint?.id ?? null,
      destination,
      path,
      lastUpdatedAt: new Date().toISOString(),
      progress: 0,
      fractionalX: undefined,
      fractionalY: undefined,
      visualOffsetX: waypoint?.visualOffsetX,
      visualOffsetY: waypoint?.visualOffsetY,
      waypointType: waypoint?.type,
      waypointDirection: path.length > 0 ? undefined : waypoint?.direction,
    };
    this.emitMovement(agent);
  }

  broadcastPosition(agent: StatefulAgent): void {
    this.broadcast('agent:position', {
      agentId: agent.id,
      position: structuredClone(agent.position),
      direction: agent.position.direction,
    });
  }

  emitMovement(agent: StatefulAgent): void {
    // Clamp position to valid grid bounds before broadcasting
    const clampedX = Math.max(0, Math.min(agent.position.x, this.gridWidth - 1));
    const clampedY = Math.max(0, Math.min(agent.position.y, this.gridHeight - 1));
    if (clampedX !== agent.position.x || clampedY !== agent.position.y) {
      console.warn(`[AgentStateManager] Clamped agent ${agent.id} position from (${agent.position.x},${agent.position.y}) to (${clampedX},${clampedY})`);
      agent.position.x = clampedX;
      agent.position.y = clampedY;
    }
    // Origin-proximity guard: catch suspicious positions near grid origin
    if (agent.position.x < 5 && agent.position.y < 5) {
      console.warn(`[AgentStateManager] Agent ${agent.id} at suspicious origin position (${agent.position.x},${agent.position.y}), movement=${agent.movement?.status}, source=broadcast`);
    }

    const movement = structuredClone(agent.movement ?? createInitialMovementState());
    const basePixelX = agent.position.x * TILE_SIZE_PX + TILE_CENTER_OFFSET_PX;
    const basePixelY = agent.position.y * TILE_SIZE_PX + TILE_CENTER_OFFSET_PX;

    if (movement.status === 'moving' && typeof movement.fractionalX === 'number' && typeof movement.fractionalY === 'number') {
      movement.fractionalX = movement.fractionalX * TILE_SIZE_PX + TILE_CENTER_OFFSET_PX;
      movement.fractionalY = movement.fractionalY * TILE_SIZE_PX + TILE_CENTER_OFFSET_PX;
    } else {
      movement.fractionalX = basePixelX;
      movement.fractionalY = basePixelY;
    }

    if (agent.id === 'main' || agent.id === 'docclaw') {
      console.log('[emitMovement]', agent.id, {
        movementStatus: movement.status,
        claimedWaypointId: movement.claimedWaypointId,
        destination: movement.destination,
        pathLength: movement.path.length,
        position: agent.position,
      });
    }

    this.lastMovementBroadcast.set(agent.id, Date.now());
    this.broadcast('agent:movement', {
      agentId: agent.id,
      movement,
      position: structuredClone(agent.position),
    });
  }

  directionFromStep(from: { x: number; y: number; direction?: Agent['position']['direction'] }, to: { x: number; y: number }): Agent['position']['direction'] {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX >= 0 ? 'east' : 'west';
    }
    if (deltaY !== 0) {
      return deltaY >= 0 ? 'south' : 'north';
    }
    return from.direction ?? 'south';
  }

  /**
   * Create or update a meeting for the given agents and session key.
   * Returns the meeting if it was newly created, or undefined if merged into existing.
   */
  private createOrUpdateMeeting(
    agentIds: string[],
    sessionKey: string,
    source: ActiveMeeting['source'],
  ): ActiveMeeting | undefined {
    const now = Date.now();

    // Check if any existing meeting covers this sessionKey
    for (const existing of this.activeMeetings.values()) {
      if (existing.sessionKey === sessionKey) {
        // Merge new agents into existing meeting
        let changed = false;
        for (const id of agentIds) {
          if (!existing.agentIds.has(id)) {
            existing.agentIds.add(id);
            existing.previousWaypointByAgent.set(id, this.agents.get(id)?.movement?.claimedWaypointId ?? null);
            changed = true;
          }
        }
        existing.lastActivityAt = now;
        if (changed) {
          this.setConferenceStatus([...existing.agentIds]);
          this.movementEngine.handleConference([...existing.agentIds]);
        }
        return undefined; // Not a new meeting
      }
    }

    // Create a new meeting
    const meetingId = `meeting_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const previousWaypointByAgent = new Map<string, string | null>();
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      previousWaypointByAgent.set(agentId, agent?.movement?.claimedWaypointId ?? null);
    }

    const meeting: ActiveMeeting = {
      id: meetingId,
      agentIds: new Set(agentIds),
      sessionKey,
      startedAt: now,
      lastActivityAt: now,
      source,
      previousWaypointByAgent,
    };
    this.activeMeetings.set(meetingId, meeting);
    return meeting;
  }

  private dismissMeeting(meetingId: string): void {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) return;

    const agentIds = [...meeting.agentIds];
    this.activeMeetings.delete(meetingId);

    logger.info({ meetingId, agentIds }, 'Conference meeting dismissed (inactivity)');

    // Release agents from conference status and restore normal behavior
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      // Release conference waypoint claim
      if (agent.movement?.claimedWaypointId) {
        const waypoint = this.findWaypointById(agent.movement.claimedWaypointId);
        if (waypoint?.type === 'conference') {
          this.releaseWaypointClaim(agent.movement.claimedWaypointId, agentId);
        }
      }

      const previousWaypointId = meeting.previousWaypointByAgent.get(agentId) ?? null;
      const restoredToPreviousSeat = previousWaypointId
        ? this.movementEngine.requestReturnToWaypoint(agentId, previousWaypointId)
        : false;

      const presence = this.presence.get(agentId);
      const restoreStatus = (presence && typeof presence.lastActivityAt === 'number'
        && (Date.now() - presence.lastActivityAt) < WORKING_GRACE_MS)
        ? 'working'
        : 'idle';

      agent.status = restoreStatus;
      if (!restoredToPreviousSeat) {
        this.movementEngine.handleStatusChange(agentId, restoreStatus, 'conference');
      }
      this.broadcast('agent:status', {
        agentId,
        status: restoreStatus,
        timestamp: new Date().toISOString(),
      });
    }

    this.broadcast('agent:conference_end', {
      meetingId,
      agentIds,
    });
  }

  private checkMeetingInactivity(): void {
    const now = Date.now();
    for (const [meetingId, meeting] of this.activeMeetings.entries()) {
      const inactivityMs = now - meeting.lastActivityAt;
      if (inactivityMs >= MEETING_INACTIVITY_THRESHOLD_MS) {
        this.dismissMeeting(meetingId);
      }
    }
  }

  private ensureAgent(id: string, name?: string): StatefulAgent {
    const existing = this.agents.get(id);
    if (existing) {
      return existing;
    }

    const agent = createInitialAgent(id, name);
    const occupied = new Set<string>();
    for (const existingAgent of this.agents.values()) {
      occupied.add(`${existingAgent.position.x},${existingAgent.position.y}`);
    }

    const spawnPositions = pixdashConfig.getSpawnPositions();
    const availableSpawns = spawnPositions.filter((pos) => !occupied.has(`${pos.x},${pos.y}`));
    if (availableSpawns.length > 0) {
      const index = Math.floor(Math.random() * availableSpawns.length);
      const spawnPos = availableSpawns[index];
      agent.position.x = spawnPos.x;
      agent.position.y = spawnPos.y;
    }
    logger.info({ agentId: id, spawnPos: { x: agent.position.x, y: agent.position.y } }, '[ensureAgent] created new agent at spawn position');
    agent.movement = createInitialMovementState();

    this.agents.set(id, agent);
    this.ensurePresence(id);
    // Set default displayName for known agents
    const configName = pixdashConfig.getDisplayName(id, agent.name);
    if (configName) agent.displayName = configName;
    // New agents start as idle — schedule initial wander
    this.movementEngine.scheduleWander(id);
    return agent;
  }

  private ensurePresence(id: string): AgentPresenceState {
    let state = this.presence.get(id);
    if (!state) {
      state = {
        explicitOffline: false,
        baselineStatus: 'idle',
      };
      this.presence.set(id, state);
    }
    return state;
  }

  private scheduleActivityDecay(id: string): void {
    const existingTimer = this.activityDecayTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.activityDecayTimers.delete(id);
      this.reevaluateStatuses(id);
    }, WORKING_GRACE_MS + 500);

    timer.unref?.();
    this.activityDecayTimers.set(id, timer);
  }

  private deriveStatus(id: string, now = Date.now()): Agent['status'] {
    const presence = this.ensurePresence(id);

    if (presence.explicitOffline) {
      return 'offline';
    }

    if (typeof presence.lastActivityAt === 'number') {
      const inactivityMs = Math.max(0, now - presence.lastActivityAt);
      if (inactivityMs < WORKING_GRACE_MS) {
        return 'working';
      }
      if (inactivityMs >= IDLE_THRESHOLD_MS) {
        return 'idle';
      }
      return 'online';
    }

    return presence.baselineStatus;
  }

  private reevaluateStatuses(agentId?: string): void {
    const now = Date.now();

    // Periodic cleanup: remove agents offline for >24h
    if (!agentId) {
      for (const [id, presence] of this.presence.entries()) {
        if (presence.explicitOffline) {
          const agent = this.agents.get(id);
          if (agent) {
            const offlineMs = Date.parse(agent.lastSeen) ? now - new Date(agent.lastSeen).getTime() : Infinity;
            if (offlineMs > 24 * 60 * 60 * 1000) {
              this.removeAgent(id);
            }
          }
        }
      }
    }

    const ids = agentId ? [agentId] : [...this.agents.keys()];

    for (const id of ids) {
      const agent = this.agents.get(id);
      if (!agent) {
        continue;
      }

      const inActiveMeeting = [...this.activeMeetings.values()].some((meeting) => meeting.agentIds.has(id));
      if (agent.status === 'conference' && inActiveMeeting) {
        continue;
      }

      const previousStatus = agent.status;
      const nextStatus = this.deriveStatus(id, now);
      if (agent.status === nextStatus) {
        continue;
      }

      agent.status = nextStatus;
      this.broadcast('agent:status', {
        agentId: id,
        status: nextStatus,
        timestamp: agent.lastSeen,
      });
      this.movementEngine.handleStatusChange(id, nextStatus, previousStatus);
    }
  }

  private setConferenceStatus(agentIds: string[], timestamp = new Date().toISOString()): void {
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      if (!agent || agent.status === 'conference') {
        continue;
      }

      agent.status = 'conference';
      this.broadcast('agent:status', {
        agentId,
        status: 'conference',
        timestamp,
      });
    }
  }

  private broadcastSettledStates(): void {
    const now = Date.now();
    const cooldownMs = 4_000;

    for (const agent of this.agents.values()) {
      const lastBroadcast = this.lastMovementBroadcast.get(agent.id) ?? 0;
      if (now - lastBroadcast < cooldownMs) {
        continue;
      }

      if (agent.movement?.status === 'moving') {
        continue;
      }

      this.lastMovementBroadcast.set(agent.id, now);
      this.emitMovement(agent);
    }

    for (const id of this.lastMovementBroadcast.keys()) {
      if (!this.agents.has(id)) {
        this.lastMovementBroadcast.delete(id);
      }
    }
  }

  private broadcast(event: FrontendEventName, payload: FrontendEventPayload): void {
    this.events.emit('broadcast', { event, payload });
  }
}
