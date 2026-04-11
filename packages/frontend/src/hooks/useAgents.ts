import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAgents,
  type Agent,
  type AgentLog,
  type AgentTask,
  type Position
} from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { normalizeIncomingPosition, useAgentsStore } from '@/store/agentsStore';
import { useUIStore } from '@/store/uiStore';
import { useMovementStore, movementStore } from '@/store/movementStore';
import { tileToPixelCenter } from '@/lib/movement';
import type { AgentMovementEventPayload } from '@pixdash/shared';

type EventPayloadMap = {
  'agent.status': { agentId: string; status: Agent['status']; timestamp?: string };
  'agent.log': { agentId: string; level: AgentLog['level']; message: string; timestamp: string };
  'agent.task': { agentId: string; taskId: string; description: string; status: string; timestamp: string };
  'agent:conference': { agentIds: string[]; sessionKey?: string; source?: string; timestamp: string };
  'agent:position': { agentId: string; position: Position; direction?: Position['direction'] };
  'agent:movement': AgentMovementEventPayload;
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
  const hasLoadedRef = useRef(false);
  const reconnectSyncInFlightRef = useRef(false);

  const loadAgents = useCallback(async (reason: 'initial' | 'reconnect') => {
    if (reason === 'initial') {
      setIsLoading(true);
    }

    try {
      const response = await getAgents();

      console.log('[PixDash Debug] setAgents sync', JSON.stringify({ reason, count: response.agents.length }));
      setAgents(response.agents);
      const syncedAgents = useAgentsStore.getState().agents;
      syncAgents(syncedAgents);
      // Local placement should only run for agents still using fallback movement.
      // Backend-authoritative agents are skipped inside placeAgentsOnLoad.
      movementStore.placeAgentsOnLoad(syncedAgents);
      setError(null);
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (reason === 'initial') {
        setAgents([]);
      }
      setError(loadError instanceof Error ? loadError.message : 'Failed to load agents');
    } finally {
      if (reason === 'initial') {
        setIsLoading(false);
      }
    }
  }, [setAgents, syncAgents]);

  useEffect(() => {
    void loadAgents('initial');
  }, [loadAgents]);

  // Use a ref for agents in the WebSocket effect to avoid re-triggering on every agents change
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const previousConnectionStateRef = useRef(connectionState);

  useEffect(() => {
    const previousConnectionState = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;

    if (!hasLoadedRef.current) {
      return;
    }

    if (previousConnectionState === 'disconnected' && connectionState === 'connected' && !reconnectSyncInFlightRef.current) {
      reconnectSyncInFlightRef.current = true;
      void loadAgents('reconnect').finally(() => {
        reconnectSyncInFlightRef.current = false;
      });
    }
  }, [connectionState, loadAgents]);

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
      case 'agent:position': {
        const payload = lastEvent.payload as EventPayloadMap['agent:position'];
        const normalizedPosition = normalizeIncomingPosition({
          ...payload.position,
          direction: payload.direction ?? payload.position.direction,
        });

        if (!normalizedPosition) {
          break;
        }

        updateAgent({
          id: payload.agentId,
          position: normalizedPosition,
          x: normalizedPosition.x,
          y: normalizedPosition.y,
          direction: normalizedPosition.direction,
        });
        break;
      }
      case 'agent:movement': {
        const payload = lastEvent.payload as EventPayloadMap['agent:movement'];
        const currentAgent = currentAgents.find((agent) => agent.id === payload.agentId);
        const hadBackendAuthority = Boolean(
          currentAgent?.movement
          && (
            currentAgent.movement.status === 'moving'
            || currentAgent.movement.path.length > 0
            || currentAgent.movement.destination != null
            || currentAgent.movement.claimedWaypointId != null
          ),
        );
        const hasBackendAuthority = payload.movement.status === 'moving'
          || payload.movement.path.length > 0
          || payload.movement.destination != null
          || payload.movement.claimedWaypointId != null;
        const normalizedPosition = normalizeIncomingPosition(payload.position);
        const destination = payload.movement.destination ? tileToPixelCenter(payload.movement.destination) : null;
        const releasedBackendAuthority = hadBackendAuthority && !hasBackendAuthority;

        updateAgent({
          id: payload.agentId,
          movement: payload.movement,
          position: normalizedPosition ?? undefined,
          ...(normalizedPosition
            ? {
                x: normalizedPosition.x,
                y: normalizedPosition.y,
                direction: normalizedPosition.direction,
              }
            : {}),
          movementState: payload.movement.status === 'moving'
            ? 'walking'
            : releasedBackendAuthority
              ? 'standing'
              : undefined,
          claimedWaypointId: payload.movement.claimedWaypointId ?? null,
          path: payload.movement.path,
          targetX: destination?.x ?? null,
          targetY: destination?.y ?? null,
          visualOffsetX: payload.movement.status === 'moving' ? 0 : undefined,
          visualOffsetY: payload.movement.status === 'moving' ? 0 : undefined,
        });

        if (releasedBackendAuthority && currentAgent) {
          void handleStatusChange(payload.agentId, currentAgent.status);
        }
        break;
      }
      case 'agent:conference': {
        const payload = lastEvent.payload as EventPayloadMap['agent:conference'];
        console.log('[PixDash Debug] agent:conference event', JSON.stringify(payload));
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
