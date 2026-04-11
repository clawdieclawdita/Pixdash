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
import { tileToPixelCenter, getArrivalStateForMovementType } from '@/lib/movement';
import { createWaypointSet, getAllWaypoints } from '@/lib/waypoints';
import type { MovementState } from '@/types';

// Shared smooth position map — written by WebSocket handler, read by canvas draw loop
// This avoids Zustand updates for high-frequency position data
export const smoothPositionTargets = new Map<string, { x: number; y: number }>();

// Module-level waypoint lookup for movement handoff state inference
const _waypointSet = createWaypointSet();
const _allWaypoints = getAllWaypoints(_waypointSet);

function inferMovementStateFromWaypoint(agentStatus: string, tileX: number, tileY: number): { movementState: MovementState } | null {
  const wp = _allWaypoints.find((w) => w.x === tileX && w.y === tileY);
  if (!wp) return null;
  if (agentStatus === 'working' && wp.type !== 'desk') return null;
  if (agentStatus === 'conference' && wp.type !== 'conference') return null;
  return { movementState: getArrivalStateForMovementType(wp.type) };
}
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
  // Safety net: re-fetch agents after 8s to catch any that were
  // placed via frontend fallback before backend broadcastSettledStates ran.
  const fallbackHealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // After initial load, schedule a heal sync to upgrade any
      // fallback-positioned agents to backend-authoritative positions.
      if (fallbackHealTimerRef.current) clearTimeout(fallbackHealTimerRef.current);
      if (reason === 'initial') {
        fallbackHealTimerRef.current = setTimeout(() => {
          fallbackHealTimerRef.current = null;
          const current = useAgentsStore.getState().agents;
          const fallbackCount = current.filter((a) => a.positionSource === 'fallback').length;
          if (fallbackCount > 0) {
            console.log(`[PixDash Debug] fallback heal: ${fallbackCount} agents still on fallback after 8s, re-syncing`);
            void loadAgents('reconnect');
          }
        }, 8_000);
      }
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
    return () => {
      if (fallbackHealTimerRef.current) clearTimeout(fallbackHealTimerRef.current);
    };
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

        // Write position target to smooth map (bypasses Zustand entirely)
        if (payload.movement.fractionalX != null && payload.movement.fractionalY != null) {
          const fx = payload.movement.fractionalX;
          const fy = payload.movement.fractionalY;
          // Reject clearly invalid positions (negative, wildly out of bounds)
          if (fx >= 0 && fy >= 0 && fx <= 2400 && fy <= 1792) {
            smoothPositionTargets.set(payload.agentId, { x: fx, y: fy });
          }
        } else {
          smoothPositionTargets.delete(payload.agentId);
        }

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
            : payload.movement.status === 'seated'
              ? (() => {
                  const wpType = payload.movement.waypointType;
                  const agentStatus = currentAgent?.status ?? 'idle';
                  if (wpType === 'desk') return agentStatus === 'working' ? 'seated-working' : 'seated-idle';
                  if (wpType === 'conference') return 'seated-conference';
                  return 'seated-idle';
                })()
              : releasedBackendAuthority
                ? 'standing'
                : undefined,
          claimedWaypointId: payload.movement.claimedWaypointId ?? null,
          path: payload.movement.path,
          targetX: destination?.x ?? null,
          targetY: destination?.y ?? null,
          visualOffsetX: payload.movement.visualOffsetX ?? (payload.movement.status === 'moving' ? 0 : undefined),
          visualOffsetY: payload.movement.visualOffsetY ?? (payload.movement.status === 'moving' ? 0 : undefined),
        });

        if (releasedBackendAuthority && currentAgent) {
          // Backend movement finished. If backend left a claimedWaypointId,
          // settle directly at that waypoint instead of re-routing through
          // handleStatusChange (which may pick a different seat). Only fall
          // through to handleStatusChange when no waypoint is claimed.
          if (payload.movement.claimedWaypointId) {
            // Agent stays where backend placed them — derive correct seated state
            // from the waypoint type instead of hardcoding seated-idle.
            const agent = useAgentsStore.getState().agents.find((a) => a.id === payload.agentId);
            const tile = { x: Math.round(payload.position.x), y: Math.round(payload.position.y) };
            const inferred = inferMovementStateFromWaypoint(agent?.status ?? 'idle', tile.x, tile.y);
            updateAgent({
              id: payload.agentId,
              movementState: inferred?.movementState ?? 'seated-idle',
              path: [],
            });
          } else {
            void handleStatusChange(payload.agentId, currentAgent.status);
          }
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
