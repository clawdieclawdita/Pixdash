import crypto from 'node:crypto';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { WsConnectedMessage, WsEventMessage, WsRequestMessage } from '@pixdash/shared';
import type { ClientContext } from '../types/index.js';
import { handleWsRequest } from './handlers.js';

export class PixDashWebSocketServer {
  private readonly clients = new Map<string, ClientContext>();

  constructor(private readonly app: FastifyInstance) {}

  async register(): Promise<void> {
    await this.app.register(websocket);

    this.app.get('/ws', { websocket: true }, (socket) => {
      const clientId = crypto.randomUUID();
      this.clients.set(clientId, { clientId, socket: socket as unknown as WebSocket });

      const connected: WsConnectedMessage = {
        type: 'connected',
        clientId,
        serverVersion: '1.0.0',
      };
      socket.send(JSON.stringify(connected));

      socket.on('message', async (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as WsRequestMessage;
          const response = await handleWsRequest(parsed, {
            agentStateManager: this.app.pixdash.agentStateManager,
            officeLayout: this.app.pixdash.officeLayout,
          });
          socket.send(JSON.stringify(response));
        } catch (error) {
          console.error('[WebSocket] Request error:', error);
          socket.send(JSON.stringify({ type: 'res', id: 'unknown', ok: false, error: 'Internal error' }));
        }
      });

      socket.on('close', () => {
        this.clients.delete(clientId);
      });
    });
  }

  broadcast<TPayload>(event: WsEventMessage<TPayload>): void {
    if (event.event === 'agent:movement') {
      const payloadAny = event.payload as { agentId?: string; movement?: { status?: string; claimedWaypointId?: string | null; destination?: unknown; path?: unknown[] } };
      if (payloadAny.agentId === 'main' || payloadAny.agentId === 'docclaw') {
        console.log('[wsServer.broadcast]', payloadAny.agentId, {
          movementStatus: payloadAny.movement?.status,
          claimedWaypointId: payloadAny.movement?.claimedWaypointId,
          destination: payloadAny.movement?.destination,
          pathLength: payloadAny.movement?.path?.length ?? null,
        });
      }
    }
    const payload = JSON.stringify(event);
    for (const [id, client] of this.clients) {
      try {
        client.socket.send(payload);
      } catch (err) {
        console.warn(`[WebSocket] Broadcast failed for client ${id}, removing: ${(err as Error).message}`);
        this.clients.delete(id);
      }
    }
  }
}
