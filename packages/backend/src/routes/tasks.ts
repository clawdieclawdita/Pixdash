import type { FastifyPluginAsync, FastifyInstance } from 'fastify';
import type { UserTask, UserTaskStatus } from '@pixdash/shared';
import { taskStore } from '../services/TaskStore.js';

interface CreateTaskBody {
  id?: string;
  name?: string;
  description?: string;
  assignedTo?: string;
  status?: UserTaskStatus;
  scheduledAt?: string;
  replySession?: string;
  metadata?: Record<string, unknown>;
}

interface ExecuteTaskBody {
  agentId?: string;
  prompt?: string;
  taskName?: string;
  taskId?: string;
  replySession?: string;
}

interface UpdateTaskBody {
  name?: string;
  description?: string;
  assignedTo?: string;
  status?: UserTaskStatus;
  scheduledAt?: string;
  replySession?: string;
  metadata?: Record<string, unknown>;
}

interface UpdateTaskStatusBody {
  status?: UserTaskStatus;
  agentId?: string;
}

const USER_TASK_STATUSES = new Set<UserTaskStatus>(['pending', 'scheduled', 'running', 'completed', 'failed']);
const SCHEDULER_INTERVAL_MS = 30_000;
let schedulerStarted = false;

function isValidStatus(status: unknown): status is UserTaskStatus {
  return typeof status === 'string' && USER_TASK_STATUSES.has(status as UserTaskStatus);
}

async function dispatchTask(app: FastifyInstance, task: UserTask): Promise<{ success: boolean; error?: string }> {
  const gatewayClient = app.pixdash.gatewayClient;
  if (!gatewayClient) {
    app.log.error({ taskId: task.id, agentId: task.assignedTo }, 'Task execution failed: Gateway client not initialized');
    return { success: false, error: 'Gateway client is not initialized' };
  }

  app.log.info({ taskId: task.id, taskName: task.name, agentId: task.assignedTo, promptLength: task.description.length }, 'Sending task to agent via Gateway chat.send');

  try {
    const result = await gatewayClient.sendChatMessage(task.assignedTo, task.description, task.id, task.replySession?.trim() || undefined);
    if (result.ok) {
      app.log.info({ taskId: task.id, taskName: task.name, agentId: task.assignedTo }, 'Task message delivered to agent successfully');
      return { success: true };
    }

    app.log.error({ taskId: task.id, taskName: task.name, agentId: task.assignedTo, error: result.error }, 'Gateway chat.send failed');
    return { success: false, error: result.error ?? 'Gateway chat.send failed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown gateway error';
    app.log.error({ err: error, taskId: task.id, taskName: task.name, agentId: task.assignedTo }, 'Task execution failed with exception');
    return { success: false, error: errorMessage };
  }
}

function broadcastTaskStatus(app: FastifyInstance, task: UserTask): void {
  app.pixdash.agentStateManager.applyTaskStatusUpdate({
    taskId: task.id,
    status: task.status,
    agentId: task.assignedTo,
    ...(task.status === 'completed' ? { completedAt: task.updatedAt } : {}),
    updatedAt: task.updatedAt,
  });
}

function startScheduler(app: FastifyInstance): void {
  if (schedulerStarted) {
    return;
  }

  const timer = setInterval(() => {
    void (async () => {
      const dueTasks = taskStore.getDueScheduledTasks(new Date());
      if (dueTasks.length === 0) {
        return;
      }

      for (const task of dueTasks) {
        const runningTask = taskStore.update(task.id, { status: 'running' });
        if (!runningTask) {
          continue;
        }

        broadcastTaskStatus(app, runningTask);
        app.log.info({ taskId: runningTask.id, agentId: runningTask.assignedTo, scheduledAt: runningTask.scheduledAt }, 'Executing scheduled task');

        const result = await dispatchTask(app, runningTask);
        if (!result.success) {
          const failedTask = taskStore.update(runningTask.id, { status: 'failed' });
          if (failedTask) {
            broadcastTaskStatus(app, failedTask);
          }
        }
      }
    })().catch((error) => {
      app.log.error({ err: error }, 'Scheduled task execution loop failed');
    });
  }, SCHEDULER_INTERVAL_MS);

  timer.unref();
  schedulerStarted = true;
}

const tasksRoutes: FastifyPluginAsync = async (app) => {
  startScheduler(app);

  app.get('/api/v1/agents/:agentId/sessions', async (request) => {
    const { agentId } = request.params as { agentId?: string };

    return {
      success: true,
      sessions: agentId?.trim() ? app.pixdash.gatewayClient?.getAgentSessions(agentId) ?? [] : [],
    };
  });

  app.get('/api/v1/tasks', async () => ({
    success: true,
    tasks: taskStore.getAll(),
  }));

  app.post('/api/v1/tasks', async (request, reply) => {
    const body = (request.body ?? {}) as CreateTaskBody;

    if (!body.name?.trim() || !body.description?.trim() || !body.assignedTo?.trim()) {
      return reply.code(400).send({ success: false, error: 'name, description and assignedTo are required' });
    }

    if (!isValidStatus(body.status)) {
      return reply.code(400).send({ success: false, error: 'A valid status is required' });
    }

    if (body.status === 'scheduled' && !body.scheduledAt) {
      return reply.code(400).send({ success: false, error: 'scheduledAt is required for scheduled tasks' });
    }

    const task = taskStore.create({
      id: body.id,
      name: body.name.trim(),
      description: body.description.trim(),
      assignedTo: body.assignedTo.trim(),
      status: body.status,
      scheduledAt: body.status === 'scheduled' ? body.scheduledAt : undefined,
      replySession: body.replySession?.trim() || undefined,
      metadata: body.metadata ?? {},
    });

    return reply.code(201).send({ success: true, task });
  });

  app.patch('/api/v1/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId?: string };
    const body = (request.body ?? {}) as UpdateTaskBody;

    if (!taskId?.trim()) {
      return reply.code(400).send({ success: false, error: 'taskId is required' });
    }

    if (body.status !== undefined && !isValidStatus(body.status)) {
      return reply.code(400).send({ success: false, error: 'A valid status is required' });
    }

    if (body.status === 'scheduled' && body.scheduledAt === undefined) {
      return reply.code(400).send({ success: false, error: 'scheduledAt is required for scheduled tasks' });
    }

    const existingTask = taskStore.get(taskId);
    if (!existingTask) {
      return reply.code(404).send({ success: false, error: 'Task not found' });
    }

    const updatedTask = taskStore.update(taskId, {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo.trim() } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.replySession !== undefined ? { replySession: body.replySession?.trim() || undefined } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      ...(body.scheduledAt !== undefined || body.status === 'scheduled'
        ? { scheduledAt: body.status === 'scheduled' || existingTask.status === 'scheduled' ? body.scheduledAt : undefined }
        : {}),
    });

    if (!updatedTask) {
      return reply.code(404).send({ success: false, error: 'Task not found' });
    }

    return { success: true, task: updatedTask };
  });

  app.delete('/api/v1/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId?: string };

    if (!taskId?.trim()) {
      return reply.code(400).send({ success: false, error: 'taskId is required' });
    }

    const deleted = taskStore.delete(taskId);
    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'Task not found' });
    }

    return { success: true, taskId };
  });

  app.post('/api/v1/tasks/execute', async (request, reply) => {
    const { agentId, prompt, taskName, taskId, replySession } = (request.body ?? {}) as ExecuteTaskBody;

    if (!agentId?.trim() || !prompt?.trim() || !taskName?.trim()) {
      return reply.code(400).send({
        success: false,
        error: 'agentId, prompt and taskName are required',
      });
    }

    let task = taskId ? taskStore.get(taskId) : undefined;
    if (!task) {
      task = taskStore.create({
        id: taskId,
        name: taskName.trim(),
        description: prompt.trim(),
        assignedTo: agentId.trim(),
        status: 'running',
        replySession: replySession?.trim() || undefined,
        metadata: {},
      });
    } else {
      task = taskStore.update(task.id, {
        name: taskName.trim(),
        description: prompt.trim(),
        assignedTo: agentId.trim(),
        replySession: replySession?.trim() || undefined,
        status: 'running',
      });
    }

    if (!task) {
      return reply.code(500).send({ success: false, error: 'Failed to persist task before execution' });
    }

    broadcastTaskStatus(app, task);
    const result = await dispatchTask(app, task);

    if (!result.success) {
      const failedTask = taskStore.update(task.id, { status: 'failed' });
      if (failedTask) {
        broadcastTaskStatus(app, failedTask);
      }
      return reply.code(502).send({ success: false, error: result.error ?? 'Gateway chat.send failed' });
    }

    return { success: true, message: 'Task sent to agent', task };
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

    const existingTask = taskStore.get(taskId);
    if (!existingTask) {
      return reply.code(404).send({ success: false, error: 'Task not found' });
    }

    const updatedTask = taskStore.update(taskId, { status, assignedTo: agentId?.trim() || existingTask.assignedTo });
    if (!updatedTask) {
      return reply.code(404).send({ success: false, error: 'Task not found' });
    }

    app.log.info({ taskId, status, agentId: updatedTask.assignedTo }, 'Manually updating task status');
    broadcastTaskStatus(app, updatedTask);

    return {
      success: true,
      taskId,
      status,
      updatedAt: updatedTask.updatedAt,
    };
  });
};

export default tasksRoutes;
