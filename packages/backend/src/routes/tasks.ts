import type { FastifyPluginAsync } from 'fastify';

interface ExecuteTaskBody {
  agentId?: string;
  prompt?: string;
  taskName?: string;
}

const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/tasks/execute', async (request, reply) => {
    const { agentId, prompt, taskName } = (request.body ?? {}) as ExecuteTaskBody;

    if (!agentId?.trim() || !prompt?.trim() || !taskName?.trim()) {
      return reply.code(400).send({
        success: false,
        error: 'agentId, prompt and taskName are required',
      });
    }

    const gatewayClient = app.pixdash.gatewayClient;
    if (!gatewayClient) {
      app.log.error({ taskName, agentId }, 'Task execution failed: Gateway client not initialized');
      return reply.code(503).send({
        success: false,
        error: 'Gateway client is not initialized',
      });
    }

    app.log.info({ taskName, agentId, promptLength: prompt.length }, 'Sending task to agent via Gateway chat.send');

    try {
      const result = await gatewayClient.sendChatMessage(agentId, prompt);

      if (result.ok) {
        app.log.info({ taskName, agentId }, 'Task message delivered to agent successfully');
        return { success: true, message: 'Task sent to agent' };
      }

      app.log.error({ taskName, agentId, error: result.error }, 'Gateway chat.send failed');
      return reply.code(502).send({ success: false, error: result.error ?? 'Gateway chat.send failed' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown gateway error';
      app.log.error({ err: error, taskName, agentId }, 'Task execution failed with exception');
      return reply.code(502).send({ success: false, error: errorMessage });
    }
  });
};

export default tasksRoutes;
