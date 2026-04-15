import appearanceSchema from '../schemas/appearance.schema.json' with { type: 'json' };
import type { FastifyPluginAsync } from 'fastify';
import type { Agent, AgentLog, AppearancePatch } from '@pixdash/shared';
import { assertValid, createValidator } from '../utils/validation.js';

function stripSensitiveFields(agent: Agent): Agent {
  const a = agent as unknown as Record<string, unknown>;
  delete a.soul;
  delete a.identity;
  const config = a.config as Record<string, unknown> | undefined;
  if (config) {
    delete config.workspace;
    delete config.agentDir;
    delete config.source;
    delete config.model;
  }
  return agent;
}

const validateAppearancePatch = createValidator<AppearancePatch>(appearanceSchema);

const agentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/agents', async () => {
    const agents = app.pixdash.agentStateManager.getAgents().map(stripSensitiveFields);
    return { agents };
  });

  app.get('/api/v1/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = app.pixdash.agentStateManager.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    return stripSensitiveFields(agent);
  });

  app.get('/api/v1/agents/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string; offset?: string; level?: AgentLog['level'] };
    const agent = app.pixdash.agentStateManager.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    return app.pixdash.agentStateManager.getLogs(id, {
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
      level: query.level,
    });
  });

  app.get('/api/v1/agents/:id/tasks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = app.pixdash.agentStateManager.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    return { tasks: app.pixdash.agentStateManager.getTasks(id) };
  });

  app.patch('/api/v1/agents/:id/appearance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = app.pixdash.agentStateManager.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    const patch = assertValid(validateAppearancePatch, request.body ?? {}, 'Invalid appearance patch');
    const appearance = await app.pixdash.agentStateManager.upsertAppearance(id, patch);
    return { success: true, appearance };
  });

  app.patch('/api/v1/agents/:id/displayName', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = app.pixdash.agentStateManager.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    const body = request.body as { displayName?: string | null } | undefined;
    const displayName = typeof body?.displayName === 'string' ? body.displayName : null;
    const result = await app.pixdash.agentStateManager.setDisplayName(id, displayName);
    return { success: true, displayName: result };
  });
};

export default agentRoutes;
