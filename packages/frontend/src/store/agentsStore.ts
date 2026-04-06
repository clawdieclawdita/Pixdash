import { create } from 'zustand';
import { DEFAULT_APPEARANCE, DEFAULT_POSITION, type Appearance, type Position } from '@pixdash/shared';
import type { Agent } from '@/lib/api';
import { loadCollisionMap, pickDeskPositions } from '@/lib/collisionMap';

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
  console.warn(`[PixDash] Agent "${agent.id}" is missing a valid position. Falling back to desk assignment.`);
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

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

const normalizePosition = (agent: Agent, assignedDesk?: { x: number; y: number }): Position => {
  if (isFiniteNumber(agent.position?.x) && isFiniteNumber(agent.position?.y) && agent.position.x > 32 && agent.position.y > 32) {
    return {
      x: agent.position.x,
      y: agent.position.y,
      direction: agent.position.direction ?? DEFAULT_POSITION.direction
    };
  }

  warnMissingPosition(agent);
  return {
    x: assignedDesk?.x ?? DEFAULT_POSITION.x,
    y: assignedDesk?.y ?? DEFAULT_POSITION.y,
    direction: agent.position?.direction ?? DEFAULT_POSITION.direction
  };
};

function normalizeAgent(agent: Agent, assignedDesk?: { x: number; y: number }): StoreAgent {
  const position = normalizePosition(agent, assignedDesk);
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

const sortAgentsForDeskAssignment = (agents: Agent[]) =>
  [...agents].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

interface AgentsState {
  agents: StoreAgent[];
  selectedAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  applyDeskAssignments: (agents: Agent[]) => Promise<void>;
  updateAgent: (agent: Partial<StoreAgent> & Pick<StoreAgent, 'id'>) => void;
  selectAgent: (agentId: string | null) => void;
  clearSelection: () => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  selectedAgentId: null,
  setAgents: (agents) => {
    const normalizedAgents = agents.map((agent) => normalizeAgent(agent));
    set((state) => ({
      agents: normalizedAgents,
      selectedAgentId:
        state.selectedAgentId && agents.some((agent) => agent.id === state.selectedAgentId)
          ? state.selectedAgentId
          : null
    }));

    void useAgentsStore.getState().applyDeskAssignments(agents);
  },
  applyDeskAssignments: async (agents) => {
    const collisionMap = await loadCollisionMap();
    const desks = pickDeskPositions(collisionMap, Math.max(agents.length, 5));
    const sortedAgents = sortAgentsForDeskAssignment(agents);
    const deskByAgentId = new Map(sortedAgents.map((agent, index) => [agent.id, desks[index] ?? desks[desks.length - 1]]));

    set((state) => ({
      agents: agents.map((agent) => normalizeAgent(agent, deskByAgentId.get(agent.id))),
      selectedAgentId:
        state.selectedAgentId && agents.some((currentAgent) => currentAgent.id === state.selectedAgentId)
          ? state.selectedAgentId
          : null
    }));
  },
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
