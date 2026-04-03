import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type {
  Agent,
  AgentConfig,
  AgentLog,
  AgentTask,
  Appearance,
  AppearancePatch,
  FrontendEventName,
  FrontendEventPayload,
  Tilemap,
  WsRequestMessage,
  WsResponseMessage,
} from '@pixdash/shared';

export interface BackendConfig {
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  gatewayUrl: string;
  gatewayToken?: string;
  openClawConfigPath: string;
  appearancesPath: string;
  officeLayoutPath: string;
}

export interface OpenClawAgentEntry {
  id: string;
  name?: string;
  model?: string | { primary?: string };
  workspace?: string;
  agentDir?: string;
}

export interface OpenClawBinding {
  agentId?: string;
  match?: {
    channel?: string;
    accountId?: string;
  };
}

export interface OpenClawConfig {
  agents?: {
    defaults?: {
      model?: string | { primary?: string };
      workspace?: string;
    };
    list?: OpenClawAgentEntry[];
  };
  bindings?: OpenClawBinding[];
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
}

export interface ConfigAgentSnapshot {
  id: string;
  name: string;
  config: AgentConfig;
  soul?: string;
  identity?: Agent['identity'];
}

export interface GatewayEnvelope {
  type: 'auth_challenge' | 'auth_response' | 'auth_success' | 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  event?: string;
  payload?: unknown;
  ok?: boolean;
  error?: string;
  nonce?: string;
  timestamp?: string;
  sessionId?: string;
}

export interface GatewayStatusEvent {
  agentId: string;
  status: Agent['status'];
  timestamp: string;
}

export interface GatewayLogEvent {
  agentId: string;
  log: AgentLog;
}

export interface GatewayTaskEvent {
  agentId: string;
  task: AgentTask;
}

export interface AgentStateSubscriber {
  (event: { event: FrontendEventName; payload: FrontendEventPayload }): void;
}

export interface ClientContext {
  clientId: string;
  socket: WebSocket;
}

export interface WsHandlerContext {
  agentStateManager: AgentStateManagerLike;
  officeLayout: Tilemap;
}

export interface AgentStateManagerLike {
  getAgents(): Agent[];
  getAgent(id: string): Agent | undefined;
  getLogs(id: string, options?: { limit?: number; offset?: number; level?: AgentLog['level'] }): {
    logs: AgentLog[];
    total: number;
    hasMore: boolean;
  };
  getTasks(id: string): AgentTask[];
  upsertAppearance(id: string, patch: AppearancePatch): Promise<Appearance>;
}

export interface PixDashServices {
  config: BackendConfig;
  agentStateManager: AgentStateManagerLike;
  officeLayout: Tilemap;
}

export interface PixDashFastifyInstance extends FastifyInstance {
  pixdash: PixDashServices;
}

export interface AppearanceStoreRecord {
  updatedAt: string;
  appearance: Appearance;
}

export type WsHandlerResult = WsResponseMessage;
export type WsRequest = WsRequestMessage;
