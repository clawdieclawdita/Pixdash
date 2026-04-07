import { useEffect, useRef, useState } from 'react';
import {
  getAgents,
  type Agent,
  type AgentLog,
  type AgentTask
} from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAgentsStore } from '@/store/agentsStore';
import { useUIStore } from '@/store/uiStore';
import { useMovementStore, movementStore } from '@/store/movementStore';

type EventPayloadMap = {
  'agent.status': { agentId: string; status: Agent['status']; timestamp?: string };
  'agent.log': { agentId: string; level: AgentLog['level']; message: string; timestamp: string };
  'agent.task': { agentId: string; taskId: string; description: string; status: string; timestamp: string };
  'agent:conference': { agentIds: string[]; sessionKey?: string; source?: string; timestamp: string };
};

export function useAgents() {
  const agents = useAgentsStore((state) => state.agents);
  const selectedAgentId = useAgentsStore((state) => state.selectedAgentId);
  const setAgents = useAgentsStore((state) => state.setAgents);
  const updateAgent = useAgentsStore((state) => state.updateAgent);
  const selectAgent = useAgentsStore((state) => state.selectAgent);
  const openPanel = useUIStore((state) => state.openPanel);
  const closePanel = useUIStore((state) => state.closePanel);
  const syncAgents = useMovementStore((state) => state.syncAgents);
  const handleStatusChange = useMovementStore((state) => state.handleStatusChange);
  const handleConference = useMovementStore((state) => state.handleConference);
  const { lastEvent, connectionState, lastError: socketError } = useWebSocket();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadAgents = async () => {
      try {
        const response = await getAgents();

        if (mounted) {
          setAgents(response.agents);
          const syncedAgents = useAgentsStore.getState().agents;
          syncAgents(syncedAgents);
          // Place agents directly at chairs on load (no walking from corridor)
          // Wander timers will handle subsequent movement.
          movementStore.placeAgentsOnLoad(syncedAgents);
          setError(null);
        }
      } catch (loadError) {
        if (mounted) {
          setAgents([]);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load agents');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadAgents();

    return () => {
      mounted = false;
    };
  }, [setAgents, syncAgents, handleStatusChange]);

  // Use a ref for agents in the WebSocket effect to avoid re-triggering on every agents change
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    if (!lastEvent) {
      return;
    }

    const currentAgents = agentsRef.current;

    switch (lastEvent.event) {
      case 'agent.status':
      case 'agent:status': {
        const payload = lastEvent.payload as EventPayloadMap['agent.status'];
        const currentAgent = currentAgents.find((agent) => agent.id === payload.agentId);
        const statusChanged = currentAgent?.status !== payload.status;

        updateAgent({
          id: payload.agentId,
          status: payload.status,
          ...(payload.timestamp ? { lastSeen: payload.timestamp } : {})
        });

        if (statusChanged) {
          void handleStatusChange(payload.agentId, payload.status);
        }
        break;
      }
      case 'agent.log':
      case 'agent:log': {
        const payload = lastEvent.payload as EventPayloadMap['agent.log'];
        const currentAgent = currentAgents.find((agent) => agent.id === payload.agentId);
        updateAgent({
          id: payload.agentId,
          logs: [
            ...(currentAgent?.logs ?? []),
            {
              timestamp: payload.timestamp,
              level: payload.level,
              message: payload.message
            }
          ]
        });
        break;
      }
      case 'agent.task':
      case 'agent:task': {
        const payload = lastEvent.payload as EventPayloadMap['agent.task'];
        const currentAgent = currentAgents.find((agent) => agent.id === payload.agentId);
        const tasks: AgentTask[] = currentAgent?.tasks ?? [];
        const nextTask: AgentTask = {
          id: payload.taskId,
          type: 'task',
          description: payload.description,
          status: payload.status,
          createdAt: payload.timestamp,
          updatedAt: payload.timestamp
        };
        const existingTaskIndex = tasks.findIndex((task: AgentTask) => task.id === nextTask.id);

        updateAgent({
          id: payload.agentId,
          tasks:
            existingTaskIndex >= 0
              ? tasks.map((task: AgentTask, index: number) => (index === existingTaskIndex ? { ...task, ...nextTask } : task))
              : [...tasks, nextTask]
        });
        break;
      }
      case 'agent:conference': {
        const payload = lastEvent.payload as EventPayloadMap['agent:conference'];
        void handleConference(payload.agentIds);
        break;
      }
      default:
        break;
    }
  }, [lastEvent, updateAgent, handleStatusChange, handleConference]);

  const handleSelectAgent = (agentId: string | null) => {
    selectAgent(agentId);

    if (agentId) {
      openPanel();
    } else {
      closePanel();
    }
  };

  return {
    agents,
    selectedAgentId,
    selectAgent: handleSelectAgent,
    isLoading,
    error,
    connectionState,
    socketError
  };
}
