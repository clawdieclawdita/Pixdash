import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Tilemap, WsEventMessage } from '@pixdash/shared';
import { loadConfig } from './config/index.js';
import { AppearanceStore } from './services/AppearanceStore.js';
import { AgentStateManager } from './services/AgentStateManager.js';
import { ConfigWatcher } from './services/ConfigWatcher.js';
import { GatewayClient } from './services/GatewayClient.js';
import agentRoutes from './routes/agents.js';
import healthRoutes from './routes/health.js';
import officeRoutes from './routes/office.js';
import { PixDashWebSocketServer } from './websocket/server.js';
import { createLogger } from './utils/logger.js';
import type { PixDashFastifyInstance } from './types/index.js';

function fallbackOfficeLayout(): Tilemap {
  const width = 20;
  const height = 15;
  return {
    version: 1,
    width,
    height,
    tileSize: 32,
    layers: {
      floor: Array.from({ length: height }, () => Array.from({ length: width }, () => 1)),
      furniture: Array.from({ length: height }, () => Array.from({ length: width }, () => 0)),
      walls: Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => (y === 0 || y === height - 1 || x === 0 || x === width - 1 ? 10 : 0)),
      ),
    },
    spawnPoints: [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 8, y: 2 }],
    walkable: Array.from({ length: height }, () => Array.from({ length: width }, () => true)),
  };
}

function loadOfficeLayout(filePath: string): Tilemap {
  if (!existsSync(filePath)) {
    return fallbackOfficeLayout();
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as Tilemap;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildServer(): Promise<PixDashFastifyInstance> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const app = Fastify({ logger: { level: config.logLevel } }) as PixDashFastifyInstance;
  app.log = logger;

  const appearanceStore = new AppearanceStore(config.appearancesPath);
  await appearanceStore.init();
  const agentStateManager = new AgentStateManager(appearanceStore);
  const officeLayout = loadOfficeLayout(config.officeLayoutPath);

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
