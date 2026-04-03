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
          socket.send(JSON.stringify({ type: 'res', id: 'unknown', ok: false, error: (error as Error).message }));
        }
      });

      socket.on('close', () => {
        this.clients.delete(clientId);
      });
    });
  }

  broadcast<TPayload>(event: WsEventMessage<TPayload>): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients.values()) {
      client.socket.send(payload);
    }
  }
}
