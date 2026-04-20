import type { Tilemap, WsResponseMessage } from '@pixdash/shared';
import type { WsHandlerContext, WsRequest } from '../types/index.js';

function ok(id: string, payload: Record<string, unknown>): WsResponseMessage {
  return { type: 'res', id, ok: true, payload };
}

function fail(id: string, error: string): WsResponseMessage {
  return { type: 'res', id, ok: false, error };
}

export async function handleWsRequest(message: WsRequest, context: WsHandlerContext): Promise<WsResponseMessage> {
  const { agentStateManager, officeLayout } = context;

  switch (message.method) {
    case 'sync':
      return ok(message.id, {
        agents: agentStateManager.getAgents(),
        officeLayout,
      });
    case 'updateAppearance': {
      const params = (message.params ?? {}) as Record<string, unknown>;
      const agentId = String(params.agentId ?? '');
      const appearance = (params.appearance ?? {}) as Record<string, unknown>;
      if (!agentId) {
        return fail(message.id, 'agentId is required');
      }
      const updated = await agentStateManager.upsertAppearance(agentId, appearance);
      return ok(message.id, { appearance: updated });
    }
    case 'moveAgent':
      return ok(message.id, context.agentStateManager.requestMove((message.params ?? {}) as import('@pixdash/shared').MoveAgentRequest));
    default:
      return fail(message.id, `Unknown method: ${String(message.method)}`);
  }
}

export function serializeSyncPayload(agents: unknown[], officeLayout: Tilemap): Record<string, unknown> {
  return { agents, officeLayout };
}
