import type {
  Agent as SharedAgent,
  AgentLog as SharedAgentLog,
  AgentTask as SharedAgentTask,
  Appearance
} from '@pixdash/shared';

export type { AgentStatus, Appearance, Position } from '@pixdash/shared';

export interface Agent extends Omit<SharedAgent, 'config' | 'logs' | 'tasks'> {
  config?: Record<string, unknown>;
  logs?: AgentLog[];
  tasks?: AgentTask[];
}

export type AgentLog = Omit<SharedAgentLog, 'id'> & {
  id?: string;
};

export interface AgentTask extends SharedAgentTask {}

export interface OfficeLayout {
  width: number;
  height: number;
  tileSize: number;
  layers: Record<string, number[][]>;
  spawnPoints?: Array<{ x: number; y: number }>;
  walkable?: boolean[][];
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_ATTEMPTS = 2;

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isNetworkError(error: unknown): error is TypeError {
  return error instanceof TypeError;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {})
        },
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;

      if (isAbortError(error)) {
        throw new Error(`API request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
      }

      if (!isNetworkError(error) || attempt === RETRY_ATTEMPTS) {
        throw error;
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('API request failed due to an unknown network error');
}

export function getAgents(): Promise<{ agents: Agent[] }> {
  return request<{ agents: Agent[] }>('/agents');
}

export function getAgent(id: string): Promise<Agent> {
  return request<Agent>(`/agents/${encodeURIComponent(id)}`);
}

export function getAgentLogs(
  id: string,
  opts?: { limit?: number; offset?: number; level?: AgentLog['level'] }
): Promise<{ logs: AgentLog[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();

  if (typeof opts?.limit === 'number') params.set('limit', String(opts.limit));
  if (typeof opts?.offset === 'number') params.set('offset', String(opts.offset));
  if (opts?.level) params.set('level', opts.level);

  const query = params.toString();
  return request<{ logs: AgentLog[]; total: number; hasMore: boolean }>(
    `/agents/${encodeURIComponent(id)}/logs${query ? `?${query}` : ''}`
  );
}

export function getAgentTasks(id: string): Promise<{ tasks: AgentTask[] }> {
  return request<{ tasks: AgentTask[] }>(`/agents/${encodeURIComponent(id)}/tasks`);
}

export function updateAppearance(id: string, appearance: Partial<Appearance>): Promise<{ success: boolean; appearance: Appearance }> {
  return request<{ success: boolean; appearance: Appearance }>(`/agents/${encodeURIComponent(id)}/appearance`, {
    method: 'PATCH',
    body: JSON.stringify(appearance)
  });
}

export function getOfficeLayout(): Promise<OfficeLayout> {
  return request<OfficeLayout>('/office/layout');
}
