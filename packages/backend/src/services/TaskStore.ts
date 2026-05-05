import type { UserTask } from '@pixdash/shared';

export type CreateUserTaskInput = Omit<UserTask, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UpdateUserTaskInput = Partial<Omit<UserTask, 'id' | 'createdAt'>>;

const makeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export class TaskStore {
  private readonly tasks = new Map<string, UserTask>();

  create(task: CreateUserTaskInput): UserTask {
    const now = new Date().toISOString();
    const createdTask: UserTask = {
      ...task,
      id: task.id?.trim() || makeId(),
      metadata: task.metadata ?? {},
      createdAt: task.createdAt ?? now,
      updatedAt: task.updatedAt ?? now,
    };

    this.tasks.set(createdTask.id, createdTask);
    return createdTask;
  }

  get(id: string): UserTask | undefined {
    return this.tasks.get(id);
  }

  getAll(): UserTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  update(id: string, partial: UpdateUserTaskInput): UserTask | undefined {
    const existing = this.tasks.get(id);
    if (!existing) {
      return undefined;
    }

    const updatedTask: UserTask = {
      ...existing,
      ...partial,
      metadata: partial.metadata ?? existing.metadata ?? {},
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  getDueScheduledTasks(now: Date): UserTask[] {
    return this.getAll().filter((task) => (
      task.status === 'scheduled'
      && typeof task.scheduledAt === 'string'
      && new Date(task.scheduledAt).getTime() <= now.getTime()
    ));
  }
}

export const taskStore = new TaskStore();
