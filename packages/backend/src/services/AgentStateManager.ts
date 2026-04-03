import { EventEmitter } from 'node:events';
import type { Agent, AgentLog, AgentTask, Appearance, AppearancePatch, FrontendEventName, FrontendEventPayload } from '@pixdash/shared';
import { DEFAULT_APPEARANCE, DEFAULT_POSITION } from '@pixdash/shared';
import type { ConfigAgentSnapshot, GatewayLogEvent, GatewayStatusEvent, GatewayTaskEvent } from '../types/index.js';
import { AppearanceStore } from './AppearanceStore.js';

function derivePosition(id: string) {
  const seed = [...id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return {
    x: 2 + (seed % 5) * 3,
    y: 2 + (Math.floor(seed / 5) % 4) * 3,
    direction: 'south' as const,
  };
}

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

  constructor(private readonly appearanceStore: AppearanceStore) {}

  async hydrateAppearance(agentId: string): Promise<void> {
    const agent = this.ensureAgent(agentId);
    agent.appearance = await this.appearanceStore.get(agentId);
  }

  subscribe(listener: (event: { event: FrontendEventName; payload: FrontendEventPayload }) => void): () => void {
    this.events.on('broadcast', listener);
    return () => this.events.off('broadcast', listener);
  }

  getAgents(): Agent[] {
    return [...this.agents.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getAgent(id: string): Agent | undefined {
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
    agent.status = event.status;
    agent.lastSeen = event.timestamp;
    if (agent.stats) {
      agent.stats.uptimeSeconds += 1;
    }
    this.broadcast('agent:status', event);
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

    let attempts = 0;
    let posKey = `${agent.position.x},${agent.position.y}`;
    while (occupied.has(posKey) && attempts < 18 * 13) {
      agent.position.x += 1;
      if (agent.position.x > 18) {
        agent.position.x = 1;
        agent.position.y += 1;
      }
      if (agent.position.y > 13) {
        agent.position.y = 1;
      }
      posKey = `${agent.position.x},${agent.position.y}`;
      attempts += 1;
    }

    this.agents.set(id, agent);
    return agent;
  }

  private broadcast(event: FrontendEventName, payload: FrontendEventPayload): void {
    this.events.emit('broadcast', { event, payload });
  }
}
