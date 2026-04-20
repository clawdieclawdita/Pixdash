import type { Agent, AgentLog, AgentTask, AgentStatus, Appearance, Position } from './agent.js';
import type { AgentMovementEventPayload, MoveAgentRequest } from './movement.js';
import type { Tilemap } from './tilemap.js';

export type GatewayEventName = 'agent:status' | 'agent:log' | 'agent:task';
export type FrontendEventName = GatewayEventName | 'agent:appearance' | 'agent:position' | 'agent:config' | 'agent:conference' | 'agent:conference_start' | 'agent:conference_end' | 'agent:movement';

export interface AgentStatusEventPayload {
  agentId: string;
  status: AgentStatus;
  timestamp: string;
}

export interface AgentLogEventPayload {
  agentId: string;
  log: AgentLog;
}

export interface AgentTaskEventPayload {
  agentId: string;
  task: AgentTask;
}

export interface AgentAppearanceEventPayload {
  agentId: string;
  appearance: Appearance;
}

export interface AgentPositionEventPayload {
  agentId: string;
  position: Position;
  direction?: Position['direction'];
}

export interface AgentConfigEventPayload {
  agentId: string;
  agent: Agent;
}

export interface AgentConferenceEventPayload {
  agentIds: string[];
  sessionKey?: string;
  source?: 'session_send' | 'shared_session' | 'sessions_spawn' | 'group_exchange';
  timestamp: string;
}

export interface AgentConferenceStartEventPayload {
  meetingId: string;
  agentIds: string[];
  sessionKey: string;
  source: 'session_send' | 'sessions_spawn' | 'group_exchange';
}

export interface AgentConferenceEndEventPayload {
  meetingId: string;
  agentIds: string[];
}

export type FrontendEventPayload =
  | AgentStatusEventPayload
  | AgentLogEventPayload
  | AgentTaskEventPayload
  | AgentAppearanceEventPayload
  | AgentPositionEventPayload
  | AgentConfigEventPayload
  | AgentConferenceEventPayload
  | AgentConferenceStartEventPayload
  | AgentConferenceEndEventPayload
  | AgentMovementEventPayload;

export interface WsConnectedMessage {
  type: 'connected';
  clientId: string;
  serverVersion: string;
}

export interface WsRequestMessage {
  type: 'req';
  id: string;
  method: 'sync' | 'updateAppearance' | 'moveAgent';
  params?: Record<string, unknown> | MoveAgentRequest;
}

export interface WsResponseMessage {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}

export interface WsEventMessage<TPayload = FrontendEventPayload> {
  type: 'event';
  event: FrontendEventName;
  payload: TPayload;
}

export interface SyncPayload {
  agents: Agent[];
  officeLayout: Tilemap;
}
