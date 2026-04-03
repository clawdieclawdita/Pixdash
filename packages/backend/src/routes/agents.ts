import appearanceSchema from '../schemas/appearance.schema.json' with { type: 'json' };
import type { FastifyPluginAsync } from 'fastify';
import type { AgentLog, AppearancePatch } from '@pixdash/shared';
import { assertValid, createValidator } from '../utils/validation.js';

const validateAppearancePatch = createValidator<AppearancePatch>(appearanceSchema);

const agentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/agents', async () => ({ agents: app.pixdash.agentStateManager.getAgents() }));

  app.get('/api/v1/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = app.pixdash.agentStateManager.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    return agent;
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
};

export default agentRoutes;
