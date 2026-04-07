import { useEffect, useRef, useState } from 'react';

type SupportedEvent = 'agent.status' | 'agent.log' | 'agent.task' | 'agent:status' | 'agent:log' | 'agent:task' | 'agent:appearance' | 'agent:config' | 'agent:conference';

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
const SUPPORTED_EVENTS = new Set<string>([
  'agent.status',
  'agent.log',
  'agent.task',
  'agent:status',
  'agent:log',
  'agent:task',
  'agent:appearance',
  'agent:config',
  'agent:conference'
]);

export function useWebSocket() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    const connect = () => {
      setConnectionState('connecting');
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        reconnectAttemptRef.current = 0;
        setLastError(null);
        setConnectionState('connected');
      });

      socket.addEventListener('message', (messageEvent) => {
        try {
          const parsed = JSON.parse(messageEvent.data as string) as {
            type?: string;
            event?: SupportedEvent;
            payload?: unknown;
          } & Record<string, unknown>;

          if (parsed.type === 'event' && parsed.event && SUPPORTED_EVENTS.has(parsed.event) && 'payload' in parsed) {
            setLastEvent(parsed as unknown as WebSocketEvent);
          }
        } catch {
          // Ignore malformed messages.
        }
      });

      socket.addEventListener('close', () => {
        setConnectionState('disconnected');
        socketRef.current = null;

        if (shouldReconnectRef.current) {
          const delay = Math.min(10_000, 1000 * 2 ** reconnectAttemptRef.current);
          reconnectAttemptRef.current += 1;
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        }
      });

      socket.addEventListener('error', () => {
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

      socketRef.current?.close();
    };
  }, []);

  return {
    connected: connectionState === 'connected',
    connectionState,
    lastEvent,
    lastError
  };
}
