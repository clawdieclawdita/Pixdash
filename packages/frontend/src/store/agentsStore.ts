import { create } from 'zustand';
import { DEFAULT_APPEARANCE, DEFAULT_POSITION, type Appearance, type Position } from '@pixdash/shared';
import type { Agent } from '@/lib/api';

export type StoreAgent = Agent & {
  x: number;
  y: number;
  color: string;
  title?: string;
  notes?: string;
};

const warnedAgentIds = new Set<string>();

const warnMissingPosition = (agent: Agent) => {
  if (warnedAgentIds.has(agent.id)) return;
  warnedAgentIds.add(agent.id);
  console.warn(`[PixDash] Agent "${agent.id}" is missing a valid position. Falling back to (${DEFAULT_POSITION.x}, ${DEFAULT_POSITION.y}).`);
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const normalizePosition = (agent: Agent): Position => {
  if (isFiniteNumber(agent.position?.x) && isFiniteNumber(agent.position?.y)) {
    return {
      x: agent.position.x,
      y: agent.position.y,
      direction: agent.position.direction ?? DEFAULT_POSITION.direction
    };
  }

  warnMissingPosition(agent);
  return { ...DEFAULT_POSITION };
};

const normalizeAppearance = (appearance?: Agent['appearance']): Appearance => ({
  bodyType: appearance?.bodyType ?? DEFAULT_APPEARANCE.bodyType,
  hair: {
    style: appearance?.hair?.style ?? DEFAULT_APPEARANCE.hair.style,
    color: appearance?.hair?.color ?? DEFAULT_APPEARANCE.hair.color
  },
  skinColor: appearance?.skinColor ?? DEFAULT_APPEARANCE.skinColor,
  outfit: {
    type: appearance?.outfit?.type ?? DEFAULT_APPEARANCE.outfit.type,
    color: appearance?.outfit?.color ?? DEFAULT_APPEARANCE.outfit.color
  },
  accessories: appearance?.accessories ?? DEFAULT_APPEARANCE.accessories
});

function normalizeAgent(agent: Agent): StoreAgent {
  const position = normalizePosition(agent);
  const appearance = normalizeAppearance(agent.appearance);

  return {
    ...agent,
    position,
    appearance,
    x: position.x,
    y: position.y,
    color: appearance.outfit.color,
    title: typeof agent.config?.title === 'string' ? agent.config.title : undefined,
    notes: typeof agent.config?.notes === 'string' ? agent.config.notes : undefined
  };
}

interface AgentsState {
  agents: StoreAgent[];
  selectedAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  updateAgent: (agent: Partial<StoreAgent> & Pick<StoreAgent, 'id'>) => void;
  selectAgent: (agentId: string | null) => void;
  clearSelection: () => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  selectedAgentId: null,
  setAgents: (agents) =>
    set((state) => ({
      agents: agents.map(normalizeAgent),
      selectedAgentId:
        state.selectedAgentId && agents.some((agent) => agent.id === state.selectedAgentId)
          ? state.selectedAgentId
          : null
    })),
  updateAgent: (agentUpdate) =>
    set((state) => {
      const existing = state.agents.find((agent) => agent.id === agentUpdate.id);

      if (!existing) {
        return state;
      }

      return {
        agents: state.agents.map((agent) => {
          if (agent.id !== agentUpdate.id) {
            return agent;
          }

          const nextPosition = {
            ...agent.position,
            ...(agentUpdate.position ?? {})
          };
          const nextAppearance = normalizeAppearance({
            ...agent.appearance,
            ...(agentUpdate.appearance ?? {}),
            hair: {
              ...agent.appearance.hair,
              ...(agentUpdate.appearance?.hair ?? {})
            },
            outfit: {
              ...agent.appearance.outfit,
              ...(agentUpdate.appearance?.outfit ?? {})
            }
          });

          return {
            ...agent,
            ...agentUpdate,
            position: nextPosition,
            x: agentUpdate.position?.x ?? agentUpdate.x ?? nextPosition.x,
            y: agentUpdate.position?.y ?? agentUpdate.y ?? nextPosition.y,
            color: agentUpdate.appearance?.outfit?.color ?? agentUpdate.color ?? nextAppearance.outfit.color,
            appearance: nextAppearance
          };
        })
      };
    }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  clearSelection: () => set({ selectedAgentId: null })
}));

export const agentsStore = {
  getState: useAgentsStore.getState,
  subscribe: useAgentsStore.subscribe,
  setAgents: useAgentsStore.getState().setAgents,
  updateAgent: useAgentsStore.getState().updateAgent,
  selectAgent: useAgentsStore.getState().selectAgent,
  clearSelection: useAgentsStore.getState().clearSelection
};
