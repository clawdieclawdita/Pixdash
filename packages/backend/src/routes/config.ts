import type { FastifyPluginAsync } from 'fastify';
import { pixdashConfig } from '../config/pixdashConfig.js';

const configRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/config', async () => pixdashConfig.getPublicConfig());
};

export default configRoutes;
