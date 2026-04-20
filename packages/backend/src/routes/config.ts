import type { FastifyPluginAsync } from 'fastify';
import { pixdashConfig } from '../config/pixdashConfig.js';

const configRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/config — read-only public config
  app.get('/api/v1/config', async () => pixdashConfig.getPublicConfig());

  // PATCH /api/v1/config/displayNames
  app.patch('/api/v1/config/displayNames', async (request, reply) => {
    const body = request.body as { agentId?: string; displayName?: string };
    if (typeof body?.agentId !== 'string' || body.agentId.trim() === '') {
      return reply.status(400).send({ error: 'agentId is required and must be a non-empty string.' });
    }
    if (typeof body?.displayName !== 'string') {
      return reply.status(400).send({ error: 'displayName is required and must be a string.' });
    }
    try {
      const result = pixdashConfig.updateDisplayName(body.agentId, body.displayName);
      return { success: true, ...result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // PATCH /api/v1/config/roles
  app.patch('/api/v1/config/roles', async (request, reply) => {
    const body = request.body as { agentId?: string; role?: string };
    if (typeof body?.agentId !== 'string' || body.agentId.trim() === '') {
      return reply.status(400).send({ error: 'agentId is required and must be a non-empty string.' });
    }
    if (typeof body?.role !== 'string') {
      return reply.status(400).send({ error: 'role is required and must be a string.' });
    }
    try {
      const result = pixdashConfig.updateRole(body.agentId, body.role);
      return { success: true, ...result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // PATCH /api/v1/config/hierarchy
  app.patch('/api/v1/config/hierarchy', async (request, reply) => {
    const body = request.body as { child?: string; newParent?: string | null };
    if (typeof body?.child !== 'string' || body.child.trim() === '') {
      return reply.status(400).send({ error: 'child is required and must be a non-empty string.' });
    }
    if (body.newParent !== null && body.newParent !== undefined && typeof body.newParent !== 'string') {
      return reply.status(400).send({ error: 'newParent must be a string or null.' });
    }
    try {
      const result = pixdashConfig.updateHierarchy(body.child, body.newParent ?? null);
      return { success: true, ...result };
    } catch (err) {
      const msg = (err as Error).message;
      const code = msg.includes('Circular') || msg.includes('own parent') ? 400 : 500;
      return reply.status(code).send({ error: msg });
    }
  });

  // POST /api/v1/config/reset
  app.post('/api/v1/config/reset', async (_request, reply) => {
    try {
      const result = pixdashConfig.resetToDefaults();
      return { success: true, ...result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
};

export default configRoutes;
