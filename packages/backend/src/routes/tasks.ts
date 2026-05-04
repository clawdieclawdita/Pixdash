import type { FastifyPluginAsync } from 'fastify';
import type { UserTaskStatus } from '@pixdash/shared';

interface ExecuteTaskBody {
  agentId?: string;
  prompt?: string;
  taskName?: string;
  taskId?: string;
  replySession?: string;
}

interface UpdateTaskStatusBody {
  status?: UserTaskStatus;
  agentId?: string;
}

const USER_TASK_STATUSES = new Set<UserTaskStatus>(['pending', 'scheduled', 'running', 'completed', 'failed']);

const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/agents/:agentId/sessions', async (request) => {
    const { agentId } = request.params as { agentId?: string };

    return {
      success: true,
      sessions: agentId?.trim() ? app.pixdash.gatewayClient?.getAgentSessions(agentId) ?? [] : [],
    };
  });

  app.post('/api/v1/tasks/execute', async (request, reply) => {
    const { agentId, prompt, taskName, taskId, replySession } = (request.body ?? {}) as ExecuteTaskBody;

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
      const result = await gatewayClient.sendChatMessage(agentId, prompt, taskId, replySession?.trim() || undefined);

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

  app.patch('/api/v1/tasks/:taskId/status', async (request, reply) => {
    const { taskId } = request.params as { taskId?: string };
    const { status, agentId } = (request.body ?? {}) as UpdateTaskStatusBody;

    if (!taskId?.trim()) {
      return reply.code(400).send({ success: false, error: 'taskId is required' });
    }

    if (!status || !USER_TASK_STATUSES.has(status)) {
      return reply.code(400).send({ success: false, error: 'A valid status is required' });
    }

    const updatedAt = new Date().toISOString();
    app.log.info({ taskId, status, agentId }, 'Manually updating task status');

    if (agentId?.trim()) {
      app.pixdash.agentStateManager.applyTaskStatusUpdate({
        taskId,
        status,
        agentId,
        updatedAt,
        ...(status === 'completed' ? { completedAt: updatedAt } : {}),
      });
    }

    return {
      success: true,
      taskId,
      status,
      updatedAt,
    };
  });
};

export default tasksRoutes;
