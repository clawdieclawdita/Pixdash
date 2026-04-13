import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { WsEventMessage } from '@pixdash/shared';
import { loadConfig } from './config/index.js';
import { AppearanceStore } from './services/AppearanceStore.js';
import { AgentStateManager } from './services/AgentStateManager.js';
import { loadOfficeLayoutWithCollisionGrid } from './services/CollisionGridLoader.js';
import { ConfigWatcher } from './services/ConfigWatcher.js';
import { GatewayClient } from './services/GatewayClient.js';
import agentRoutes from './routes/agents.js';
import healthRoutes from './routes/health.js';
import officeRoutes from './routes/office.js';
import { PixDashWebSocketServer } from './websocket/server.js';
import { createLogger } from './utils/logger.js';
import type { PixDashFastifyInstance } from './types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildServer(): Promise<PixDashFastifyInstance> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const app = Fastify({ logger: { level: config.logLevel } }) as PixDashFastifyInstance;
  app.log = logger;

  const appearanceStore = new AppearanceStore(config.appearancesPath);
  await appearanceStore.init();
  const officeLayout = await loadOfficeLayoutWithCollisionGrid(config.officeLayoutPath);
  const agentStateManager = new AgentStateManager(appearanceStore, officeLayout);

  app.decorate('pixdash', {
    config,
    agentStateManager,
    officeLayout,
  });

  await app.register(cors, { origin: true });

  const wsServer = new PixDashWebSocketServer(app);
  await wsServer.register();

  agentStateManager.subscribe(({ event, payload }) => {
    wsServer.broadcast({ type: 'event', event, payload } satisfies WsEventMessage);
  });

  const configWatcher = new ConfigWatcher(config, agentStateManager);
  await configWatcher.start();

  const gatewayClient = new GatewayClient(config, agentStateManager);
  gatewayClient.start();

  await app.register(healthRoutes);
  await app.register(agentRoutes);
  await app.register(officeRoutes);

  // Serve frontend static files in production
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  if (existsSync(frontendDist)) {
    await app.register(fastifyStatic, { root: frontendDist, prefix: '/' });
    app.setNotFoundHandler((_request, reply) => {
      reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    agentStateManager.shutdown();
    gatewayClient.stop();
    await configWatcher.stop();
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    pixdash: PixDashFastifyInstance['pixdash'];
  }
}

async function main(): Promise<void> {
  const app = await buildServer();

  try {
    await app.listen({ port: app.pixdash.config.port, host: app.pixdash.config.host });
    app.log.info({ port: app.pixdash.config.port }, 'PixDash backend listening');
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start PixDash backend');
    process.exit(1);
  }
}

void main();
