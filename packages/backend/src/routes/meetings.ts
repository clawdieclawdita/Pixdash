import type { FastifyPluginAsync } from 'fastify';

const meetingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/meetings', async () => {
    const meetings = app.pixdash.agentStateManager.getActiveMeetings();
    return { meetings };
  });
};

export default meetingsRoutes;
