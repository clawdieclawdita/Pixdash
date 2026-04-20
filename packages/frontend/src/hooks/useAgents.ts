import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAgents,
  getMeetings,
  type Agent,
  type AgentLog,
  type AgentTask,
  type Position,
} from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { normalizeIncomingPosition, useAgentsStore } from '@/store/agentsStore';
import { useUIStore } from '@/store/uiStore';
import { configStore } from '@/store/configStore';
import { useMovementStore, movementStore } from '@/store/movementStore';
import { tileToPixelCenter, getArrivalStateForMovementType } from '@/lib/movement';
import { createWaypointSet, getAllWaypoints } from '@/lib/waypoints';
import { debugAgent } from '@/lib/debug';
import type { MovementState } from '@/types';

// Shared smooth position map — written by WebSocket handler, read by canvas draw loop
// This avoids Zustand updates for high-frequency position data
export const smoothPositionTargets = new Map<string, { x: number; y: number; direction?: Direction; moving: boolean }>();
export const recentMovingAgents = new Map<string, number>();
const RECENT_MOVING_GRACE_MS = 1500;

// Throttle Zustand state updates from high-frequency movement events.
// Only update store at ~8Hz regardless of backend broadcast rate.
const agentMovementBuffer = new Map<string, any>();
let lastStoreFlush = 0;
const STORE_FLUSH_INTERVAL_MS = 125; // ~8Hz

function flushMovementBuffer(updateAgentFn: (update: any) => void) {
  const now = performance.now();
  if (now - lastStoreFlush < STORE_FLUSH_INTERVAL_MS) return false;
  for (const [, update] of agentMovementBuffer) {
    updateAgentFn(update);
  }
  agentMovementBuffer.clear();
  lastStoreFlush = now;
  return true;
}

function bufferMovementUpdate(agentId: string, update: any, updateAgentFn: (update: any) => void) {
  agentMovementBuffer.set(agentId, update);
  // If this is a terminal state change (seated, idle, arrived), flush immediately
  const movement = update.movement;
  if (movement && movement.status !== 'moving') {
    flushMovementBuffer(updateAgentFn);
  }
}

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
import type { AgentMovementEventPayload, Direction } from '@pixdash/shared';

type EventPayloadMap = {
  'agent.status': { agentId: string; status: Agent['status']; timestamp?: string };
  'agent.log': { agentId: string; level: AgentLog['level']; message: string; timestamp: string };
  'agent.task': { agentId: string; taskId: string; description: string; status: string; timestamp: string };
  'agent:conference': { agentIds: string[]; sessionKey?: string; source?: string; timestamp: string };
  'agent:conference_start': { meetingId: string; agentIds: string[]; sessionKey: string; source: string; startedAt: number };
  'agent:conference_end': { meetingId: string; agentIds: string[] };
  'agent:position': { agentId: string; position: Position; direction?: Position['direction'] };
  'agent:appearance': { agentId: string; appearance: Agent['appearance'] };
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
  const { eventsVersion, drainEvents, connectionState, lastError: socketError } = useWebSocket();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const reconnectSyncInFlightRef = useRef(false);
  // Safety net: re-fetch agents after 8s to catch any that were
  // placed via frontend fallback before backend broadcastSettledStates ran.
  const fallbackHealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pruneRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Prune stale entries from recentMovingAgents every 30s
  useEffect(() => {
    const GRACE_2X = RECENT_MOVING_GRACE_MS * 2;
    pruneRef.current = setInterval(() => {
      const now = Date.now();
      for (const [id, ts] of recentMovingAgents) {
        if (now - ts > GRACE_2X) recentMovingAgents.delete(id);
      }
    }, 30_000);
    return () => { if (pruneRef.current) clearInterval(pruneRef.current); };
  }, []);

  const loadAgents = useCallback(async (reason: 'initial' | 'reconnect') => {
    if (reason === 'initial') {
      setIsLoading(true);
    }

    try {
      const response = await getAgents();

      const now = Date.now();
      const protectedAgents = response.agents.map((agent) => {
        const lastMovingAt = recentMovingAgents.get(agent.id);
        const backendMoving = agent.movement?.status === 'moving';
        if (!lastMovingAt || backendMoving || now - lastMovingAt > RECENT_MOVING_GRACE_MS) {
          return agent;
        }

        const current = useAgentsStore.getState().agents.find((entry) => entry.id === agent.id);
        if (!current || current.movementState !== 'walking') {
          return agent;
        }

        const movement = agent.movement;
        if (!movement) {
          return agent;
        }

        return {
          ...agent,
          movement: {
            ...movement,
            status: 'moving' as const,
            path: current.path.map((step) => ({ x: step.x, y: step.y })),
            claimedWaypointId: current.claimedWaypointId,
            destination: current.targetX != null && current.targetY != null
              ? {
                  x: Math.round((current.targetX - 16) / 32),
                  y: Math.round((current.targetY - 16) / 32),
                }
              : movement.destination,
            waypointDirection: current.waypointDirection ?? movement.waypointDirection,
          },
          position: {
            x: Math.round((current.x - 16) / 32),
            y: Math.round((current.y - 16) / 32),
            direction: current.direction,
          },
        };
      });

      debugAgent('setAgents', '[PixDash Debug] setAgents sync', { reason, count: protectedAgents.length });

      // Enrich agents with display names from config (pixdash.json)
      const displayNames = configStore.getState().config.displayNames;
      const enrichedAgents = protectedAgents.map((agent) => {
        if (!agent.displayName && displayNames[agent.id]) {
          return { ...agent, displayName: displayNames[agent.id] };
        }
        return agent;
      });

      setAgents(enrichedAgents);
      const syncedAgents = useAgentsStore.getState().agents;
      syncAgents(syncedAgents);
      // Local placement should only run for agents still using fallback movement.
      // Backend-authoritative agents are skipped inside placeAgentsOnLoad.
      movementStore.placeAgentsOnLoad(syncedAgents);

      // Fetch active meetings on initial load/reconnect (404-safe)
      void getMeetings().then((meetings) => {
        if (meetings.length > 0) {
          useAgentsStore.getState().setActiveMeetings(meetings);
        }
      });

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
            console.warn(`[PixDash] ${fallbackCount} agents still on fallback after 8s, re-syncing`);
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

  // Re-enrich agents with display names once config finishes loading.
  // Fixes race condition where loadAgents runs before fetchConfig completes.
  useEffect(() => {
    const unsub = configStore.subscribe((state) => {
      if (!state.isLoaded) return;
      const displayNames = state.config.displayNames;
      if (!displayNames || Object.keys(displayNames).length === 0) return;
      const current = useAgentsStore.getState().agents;
      let changed = false;
      const enriched = current.map((a) => {
        if (!a.displayName && displayNames[a.id]) {
          changed = true;
          return { ...a, displayName: displayNames[a.id] };
        }
        return a;
      });
      if (changed) setAgents(enriched);
    });
    return unsub;
  }, [setAgents]);

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
    if (eventsVersion === 0) {
      return;
    }

    const events = drainEvents();
    if (events.length === 0) {
      return;
    }

    for (const lastEvent of events) {
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
      case 'agent:appearance': {
        const payload = lastEvent.payload as EventPayloadMap['agent:appearance'];
        if (!payload.appearance) {
          break;
        }

        updateAgent({
          id: payload.agentId,
          appearance: payload.appearance,
          bodyType: payload.appearance.bodyType,
          color: payload.appearance.outfit?.color,
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
        // Only keep target while agent is actually moving — clear on seated/idle
        const isActuallyMoving = payload.movement.status === 'moving'
          && (payload.movement.path.length > 0 || payload.movement.destination != null);
        if (isActuallyMoving && payload.movement.fractionalX != null && payload.movement.fractionalY != null) {
          recentMovingAgents.set(payload.agentId, Date.now());
          const fx = payload.movement.fractionalX;
          const fy = payload.movement.fractionalY;
          // Reject clearly invalid positions (negative, wildly out of bounds)
          if (fx >= 0 && fy >= 0 && fx <= 2400 && fy <= 1792) {
            const previous = smoothPositionTargets.get(payload.agentId);
            smoothPositionTargets.set(payload.agentId, {
              x: fx,
              y: fy,
              direction: payload.position.direction,
              moving: true,
            });
            debugAgent(payload.agentId, '[pixdash][movement-in] ' + payload.agentId, {
                status: payload.movement.status,
                pos: payload.position,
                fractional: { x: fx, y: fy },
                previousTarget: previous ?? null,
                changed: previous?.x !== fx || previous?.y !== fy || previous?.direction !== payload.position.direction,
                pathLen: payload.movement.path.length,
                destination: payload.movement.destination,
                claimedWaypointId: payload.movement.claimedWaypointId,
                waypointDirection: payload.movement.waypointDirection,
              });
          }
        } else {
          recentMovingAgents.delete(payload.agentId);
          smoothPositionTargets.delete(payload.agentId);
          debugAgent(payload.agentId, '[pixdash][movement-stop] ' + payload.agentId, {
              status: payload.movement.status,
              pos: payload.position,
              pathLen: payload.movement.path.length,
              destination: payload.movement.destination,
              claimedWaypointId: payload.movement.claimedWaypointId,
            });
        }

        // Buffer the Zustand state update — only flush at ~8Hz for moving agents.
        // Terminal states (seated, idle) flush immediately.
        bufferMovementUpdate(payload.agentId, {
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
          waypointDirection: payload.movement.waypointDirection,
        }, updateAgent);

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
        void handleConference(payload.agentIds);
        break;
      }
      case 'agent:conference_start': {
        const payload = lastEvent.payload as EventPayloadMap['agent:conference_start'];
        const { addMeeting } = useAgentsStore.getState();
        addMeeting({
          id: payload.meetingId,
          agentIds: payload.agentIds,
          sessionKey: payload.sessionKey,
          startedAt: payload.startedAt,
          source: payload.source,
        });
        break;
      }
      case 'agent:conference_end': {
        const payload = lastEvent.payload as EventPayloadMap['agent:conference_end'];
        const { removeMeeting } = useAgentsStore.getState();
        removeMeeting(payload.meetingId);
        break;
      }
      default:
        break;
      }
    }
  }, [eventsVersion, drainEvents, updateAgent, handleStatusChange, handleConference]);

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
