declare module '@pixdash/shared' {
  export type AgentStatus = 'online' | 'idle' | 'offline' | 'busy';
  export type Direction = 'north' | 'south' | 'east' | 'west';
  export type BodyType = 'male' | 'female' | 'neutral';
  export type HairStyle = 'short' | 'long' | 'bald' | 'ponytail' | 'spiky';
  export type OutfitType = 'casual' | 'formal' | 'hoodie' | 'tank-top';
  export type AccessoryType = 'glasses' | 'hat' | 'headphones' | 'watch';

  export interface Position {
    x: number;
    y: number;
    direction?: Direction;
  }

  export interface Hair {
    style: HairStyle;
    color: string;
  }

  export interface Outfit {
    type: OutfitType;
    color: string;
  }

  export interface Accessory {
    type: AccessoryType;
    color?: string;
  }

  export interface Appearance {
    bodyType: BodyType;
    hair: Hair;
    skinColor: string;
    outfit: Outfit;
    accessories?: Accessory[];
  }

  export interface AgentConfig {
    model?: string;
    channel?: string;
    workspace?: string;
    source?: string;
    agentDir?: string;
  }

  export interface AgentStats {
    messagesProcessed: number;
    tasksCompleted: number;
    uptimeSeconds: number;
  }

  export interface AgentLog {
    id: string;
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    metadata?: Record<string, unknown>;
  }

  export interface AgentTask {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    description: string;
    metadata?: Record<string, unknown>;
  }

  export interface Agent {
    id: string;
    name: string;
    status: AgentStatus;
    lastSeen: string;
    position: Position;
    appearance: Appearance;
    config?: AgentConfig;
    stats?: AgentStats;
    logs?: AgentLog[];
    tasks?: AgentTask[];
    soul?: string;
    identity?: {
      creature?: string;
      vibe?: string;
      emoji?: string;
      avatar?: string;
      notes?: string[];
    };
  }

  export type AppearancePatch = Partial<Appearance> & {
    hair?: Partial<Hair>;
    outfit?: Partial<Outfit>;
    accessories?: Accessory[];
  };

  export interface Tilemap {
    version?: number;
    width: number;
    height: number;
    tileSize: number;
    layers: {
      floor: number[][];
      furniture: number[][];
      walls: number[][];
    };
    spawnPoints?: Array<{ x: number; y: number }>;
    walkable?: boolean[][];
  }

  export type GatewayEventName = 'agent:status' | 'agent:log' | 'agent:task';
  export type FrontendEventName = GatewayEventName | 'agent:appearance' | 'agent:position' | 'agent:config';

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

  export type FrontendEventPayload =
    | AgentStatusEventPayload
    | AgentLogEventPayload
    | AgentTaskEventPayload
    | AgentAppearanceEventPayload
    | AgentPositionEventPayload
    | AgentConfigEventPayload;

  export interface WsConnectedMessage {
    type: 'connected';
    clientId: string;
    serverVersion: string;
  }

  export interface WsRequestMessage {
    type: 'req';
    id: string;
    method: 'sync' | 'updateAppearance' | 'moveAgent';
    params?: Record<string, unknown>;
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

  export const DEFAULT_POSITION: Position;
  export const DEFAULT_APPEARANCE: Appearance;
  export const GATEWAY_EVENT_NAMES: readonly GatewayEventName[];
}
