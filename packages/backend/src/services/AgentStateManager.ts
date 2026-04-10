import { EventEmitter } from 'node:events';
import type { Agent, AgentLog, AgentTask, Appearance, AppearancePatch, FrontendEventName, FrontendEventPayload } from '@pixdash/shared';
import { DEFAULT_APPEARANCE, DEFAULT_POSITION } from '@pixdash/shared';
import type { ConfigAgentSnapshot, GatewayConferenceEvent, GatewayLogEvent, GatewayStatusEvent, GatewayTaskEvent } from '../types/index.js';
import { AppearanceStore } from './AppearanceStore.js';

const AGENT_SPAWN_POSITIONS: Array<{ x: number; y: number }> = [
  // All positions verified walkable against blocked.png (brightness > 128)
  // Spread across main corridor (rows 21-22)
  { x: 3, y: 22 },
  { x: 6, y: 22 },
  { x: 16, y: 22 },
  { x: 20, y: 21 },
  { x: 23, y: 22 },
  { x: 31, y: 22 },
  { x: 35, y: 22 },
  { x: 48, y: 22 },
  { x: 52, y: 22 },
  { x: 57, y: 22 },
  { x: 69, y: 22 },
  { x: 72, y: 22 },
  { x: 3, y: 21 },
  { x: 18, y: 21 },
  { x: 32, y: 21 },
  { x: 38, y: 21 },
];

function derivePosition(_id: string) {
  const index = Math.floor(Math.random() * AGENT_SPAWN_POSITIONS.length);
  const spawnPos = AGENT_SPAWN_POSITIONS[index];
  return {
    x: spawnPos.x,
    y: spawnPos.y,
    direction: 'south' as const,
  };
}

const IDLE_THRESHOLD_MS = 300_000; // 5 minutes
const WORKING_GRACE_MS = 10_000; // 10 seconds, activity within this window = working
const STATUS_REEVALUATION_INTERVAL_MS = 30_000;

type AgentPresenceState = {
  explicitOffline: boolean;
  baselineStatus: 'online' | 'idle';
  lastActivityAt?: number;
};

function createInitialAgent(id: string, name = id): Agent {
  return {
    id,
    name,
    status: 'idle',
    lastSeen: new Date().toISOString(),
    position: derivePosition(id) ?? { ...DEFAULT_POSITION },
    appearance: structuredClone(DEFAULT_APPEARANCE),
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
  private readonly agents = new Map<string, Agent>();
  private readonly events = new EventEmitter();
  private readonly presence = new Map<string, AgentPresenceState>();
  private readonly activityDecayTimers = new Map<string, NodeJS.Timeout>();
  private readonly statusInterval: NodeJS.Timeout;

  constructor(private readonly appearanceStore: AppearanceStore) {
    this.statusInterval = setInterval(() => {
      this.reevaluateStatuses();
    }, STATUS_REEVALUATION_INTERVAL_MS);
    this.statusInterval.unref?.();
  }

  async hydrateAppearance(agentId: string): Promise<void> {
    const agent = this.ensureAgent(agentId);
    agent.appearance = await this.appearanceStore.get(agentId);
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
    agent.appearance = await this.appearanceStore.get(snapshot.id);
    this.broadcast('agent:config', { agentId: snapshot.id, agent: structuredClone(agent) });
  }

  applyStatusEvent(event: GatewayStatusEvent): void {
    const agent = this.ensureAgent(event.agentId);
    const presence = this.ensurePresence(event.agentId);
    const isSyntheticSnapshot = event.source === 'presence_snapshot' || event.source === 'health_snapshot';
    const hasFreshActivity = typeof presence.lastActivityAt === 'number'
      && Math.max(0, Date.now() - presence.lastActivityAt) < WORKING_GRACE_MS;
    const shouldPreserveWorking = isSyntheticSnapshot && hasFreshActivity && event.status !== 'offline';

    if (!shouldPreserveWorking) {
      presence.explicitOffline = event.status === 'offline';
      if (!presence.explicitOffline) {
        presence.baselineStatus = event.status === 'idle' ? 'idle' : 'online';
      }
    }

    agent.lastSeen = event.timestamp;
    const derivedStatus = this.deriveStatus(event.agentId);
    agent.status = derivedStatus;

    if (agent.stats) {
      agent.stats.uptimeSeconds += 1;
    }

    this.broadcast('agent:status', {
      agentId: event.agentId,
      status: derivedStatus,
      timestamp: agent.lastSeen,
    });
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
    if (validAgentIds.length < 2) {
      return;
    }

    this.broadcast('agent:conference', {
      agentIds: validAgentIds,
      sessionKey: event.sessionKey,
      source: event.source,
      timestamp: event.timestamp ?? new Date().toISOString(),
    });
  }

  recordActivity(id: string, timestamp = Date.now()): void {
    const agent = this.ensureAgent(id);
    const presence = this.ensurePresence(id);
    presence.explicitOffline = false;
    presence.baselineStatus = 'online';
    presence.lastActivityAt = timestamp;
    agent.status = 'working';
    agent.lastSeen = new Date(timestamp).toISOString();
    this.broadcast('agent:status', {
      agentId: id,
      status: 'working',
      timestamp: agent.lastSeen,
    });
    this.scheduleActivityDecay(id);
  }

  async upsertAppearance(id: string, patch: AppearancePatch): Promise<Appearance> {
    const agent = this.ensureAgent(id);
    const updated = await this.appearanceStore.merge(id, patch);
    agent.appearance = updated;
    this.broadcast('agent:appearance', { agentId: id, appearance: updated });
    return structuredClone(updated);
  }

  private ensureAgent(id: string, name?: string): Agent {
    const existing = this.agents.get(id);
    if (existing) {
      return existing;
    }

    const agent = createInitialAgent(id, name);
    const occupied = new Set<string>();
    for (const existingAgent of this.agents.values()) {
      occupied.add(`${existingAgent.position.x},${existingAgent.position.y}`);
    }

    // Find an unoccupied spawn position
    const availableSpawns = AGENT_SPAWN_POSITIONS.filter(
      (pos) => !occupied.has(`${pos.x},${pos.y}`)
    );

    if (availableSpawns.length > 0) {
      const index = Math.floor(Math.random() * availableSpawns.length);
      const spawnPos = availableSpawns[index];
      agent.position.x = spawnPos.x;
      agent.position.y = spawnPos.y;
    }
    // If all spawns are occupied, keep the derivePosition result

    this.agents.set(id, agent);
    this.ensurePresence(id);
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
    const ids = agentId ? [agentId] : [...this.agents.keys()];

    for (const id of ids) {
      const agent = this.agents.get(id);
      if (!agent) {
        continue;
      }

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
    }
  }

  private broadcast(event: FrontendEventName, payload: FrontendEventPayload): void {
    this.events.emit('broadcast', { event, payload });
  }
}
