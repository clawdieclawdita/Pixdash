import { useEffect, useRef, useState } from 'react';

type SupportedEvent =
  | 'agent.status'
  | 'agent.log'
  | 'agent.task'
  | 'agent:status'
  | 'agent:log'
  | 'agent:task'
  | 'agent:appearance'
  | 'agent:config'
  | 'agent:conference'
  | 'agent:position'
  | 'agent:movement';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface WebSocketEvent<T = unknown> {
  type: 'event';
  event: SupportedEvent;
  payload: T;
}

function resolveWsUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (import.meta.env.VITE_API_URL) {
    const apiUrl = new URL(import.meta.env.VITE_API_URL);
    apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    apiUrl.pathname = '/ws';
    apiUrl.search = '';
    apiUrl.hash = '';
    return apiUrl.toString();
  }

  // Derive from current browser location (works on any host)
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/ws`;
}

const WS_URL = resolveWsUrl();
const HEARTBEAT_SEND_INTERVAL_MS = 15_000;
const HEARTBEAT_STALE_AFTER_MS = 45_000;
const CONNECT_TIMEOUT_MS = 10_000;
const SUPPORTED_EVENTS = new Set<string>([
  'agent.status',
  'agent.log',
  'agent.task',
  'agent:status',
  'agent:log',
  'agent:task',
  'agent:appearance',
  'agent:config',
  'agent:conference',
  'agent:position',
  'agent:movement'
]);

export function useWebSocket() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [eventsVersion, setEventsVersion] = useState(0);
  const eventQueueRef = useRef<WebSocketEvent[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const staleCheckIntervalRef = useRef<number | null>(null);
  const lastReceivedAtRef = useRef<number>(Date.now());
  const socketRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    const clearHeartbeatTimers = () => {
      if (connectTimeoutRef.current !== null) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (staleCheckIntervalRef.current !== null) {
        window.clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }
    };

    const connect = () => {
      setConnectionState('connecting');
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;
      lastReceivedAtRef.current = Date.now();
      connectTimeoutRef.current = window.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          setLastError('WebSocket connect timed out. Retrying…');
          socket.close();
        }
      }, CONNECT_TIMEOUT_MS);

      socket.addEventListener('open', () => {
        reconnectAttemptRef.current = 0;
        lastReceivedAtRef.current = Date.now();
        setLastError(null);
        setConnectionState('connected');

        clearHeartbeatTimers();
        heartbeatIntervalRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, HEARTBEAT_SEND_INTERVAL_MS);

        staleCheckIntervalRef.current = window.setInterval(() => {
          if (Date.now() - lastReceivedAtRef.current > HEARTBEAT_STALE_AFTER_MS) {
            setLastError('WebSocket heartbeat timed out. Reconnecting…');
            socket.close();
          }
        }, HEARTBEAT_SEND_INTERVAL_MS);
      });

      socket.addEventListener('message', (messageEvent) => {
        if (connectTimeoutRef.current !== null) {
          window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        lastReceivedAtRef.current = Date.now();
        try {
          const parsed = JSON.parse(messageEvent.data as string) as {
            type?: string;
            event?: SupportedEvent;
            payload?: unknown;
          } & Record<string, unknown>;

          if (parsed.type === 'event' && parsed.event && SUPPORTED_EVENTS.has(parsed.event) && 'payload' in parsed) {
            eventQueueRef.current.push(parsed as unknown as WebSocketEvent);
            setEventsVersion((version) => version + 1);
          }
        } catch {
          // Ignore malformed messages.
        }
      });

      socket.addEventListener('close', () => {
        clearHeartbeatTimers();
        setConnectionState('disconnected');
        socketRef.current = null;

        if (shouldReconnectRef.current) {
          const delay = Math.min(10_000, 1000 * 2 ** reconnectAttemptRef.current);
          reconnectAttemptRef.current += 1;
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        }
      });

      socket.addEventListener('error', () => {
        if (connectTimeoutRef.current !== null) {
          window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setLastError('WebSocket connection failed. Retrying…');
        setConnectionState('disconnected');
        socket.close();
      });
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (connectTimeoutRef.current !== null) {
        window.clearTimeout(connectTimeoutRef.current);
      }

      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
      }
      if (staleCheckIntervalRef.current !== null) {
        window.clearInterval(staleCheckIntervalRef.current);
      }

      socketRef.current?.close();
    };
  }, []);

  return {
    connected: connectionState === 'connected',
    connectionState,
    eventsVersion,
    drainEvents: () => {
      const events = eventQueueRef.current;
      eventQueueRef.current = [];
      return events;
    },
    lastError
  };
}
