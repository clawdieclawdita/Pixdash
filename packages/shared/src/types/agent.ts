export type AgentStatus = 'working' | 'online' | 'idle' | 'offline' | 'busy';
export type Direction = 'north' | 'south' | 'east' | 'west';
export type BodyType = 'male' | 'female' | 'neutral' | 'michael' | 'angela' | 'phillis' | 'creed' | 'ryan' | 'pam' | 'kelly' | 'kate' | 'pites' | 'jim';
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
