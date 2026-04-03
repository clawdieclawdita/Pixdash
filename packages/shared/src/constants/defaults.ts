import type { Appearance, Position } from '../types/agent.js';

export const DEFAULT_POSITION: Position = {
  x: 0,
  y: 0,
  direction: 'south'
};

export const DEFAULT_APPEARANCE: Appearance = {
  bodyType: 'neutral',
  hair: {
    style: 'short',
    color: '#2C1810'
  },
  skinColor: '#E8BEAC',
  outfit: {
    type: 'casual',
    color: '#3B5998'
  },
  accessories: []
};

export const GATEWAY_EVENT_NAMES = ['agent:status', 'agent:log', 'agent:task'] as const;
