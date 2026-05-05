import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserTask, UserTaskStatus } from '@pixdash/shared';
import {
  createTask as createTaskApi,
  deleteTask as deleteTaskApi,
  fetchTasks,
  updateTask as updateTaskApi,
  updateTaskStatus as updateTaskStatusApi,
} from '@/lib/api';

type TaskUpdates = Partial<Pick<UserTask, 'description' | 'name' | 'assignedTo' | 'status' | 'scheduledAt' | 'replySession' | 'metadata'>>;

interface TasksState {
  tasks: UserTask[];
  hydrated: boolean;
  loadTasks: () => Promise<void>;
  addTask: (task: Omit<UserTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<UserTask>;
  updateTask: (id: string, updates: TaskUpdates) => Promise<UserTask>;
  updateTaskStatus: (id: string, status: UserTaskStatus, agentId?: string) => Promise<UserTask | undefined>;
  handleTaskStatusEvent: (event: { taskId: string; status: UserTaskStatus; updatedAt?: string }) => void;
  removeTask: (id: string) => Promise<void>;
  clearTask: (id: string) => Promise<void>;
  getTasksByAgent: (agentId: string) => UserTask[];
}

const sortTasks = (tasks: UserTask[]) => [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const mergeTask = (tasks: UserTask[], nextTask: UserTask) => {
  const existingIndex = tasks.findIndex((task) => task.id === nextTask.id);
  if (existingIndex === -1) {
    return sortTasks([nextTask, ...tasks]);
  }

  const nextTasks = tasks.map((task, index) => (index === existingIndex ? nextTask : task));
  return sortTasks(nextTasks);
};

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [],
      hydrated: false,
      loadTasks: async () => {
        const tasks = await fetchTasks();
        set({ tasks: sortTasks(tasks), hydrated: true });
      },
      addTask: async (task) => {
        const response = await createTaskApi(task);
        set((state) => ({ tasks: mergeTask(state.tasks, response.task) }));
        return response.task;
      },
      updateTask: async (id, updates) => {
        const response = await updateTaskApi(id, updates);
        set((state) => ({ tasks: mergeTask(state.tasks, response.task) }));
        return response.task;
      },
      updateTaskStatus: async (id, status, agentId) => {
        const existingTask = get().tasks.find((task) => task.id === id);
        if (!existingTask) {
          return undefined;
        }

        const response = await updateTaskStatusApi(id, status, agentId ?? existingTask.assignedTo);
        const updatedTask: UserTask = {
          ...existingTask,
          status: response.status,
          assignedTo: agentId ?? existingTask.assignedTo,
          updatedAt: response.updatedAt,
        };
        set((state) => ({ tasks: mergeTask(state.tasks, updatedTask) }));
        return updatedTask;
      },
      handleTaskStatusEvent: (event) => {
        set((state) => {
          const existingTask = state.tasks.find((task) => task.id === event.taskId);
          if (!existingTask) {
            return state;
          }

          return {
            tasks: mergeTask(state.tasks, {
              ...existingTask,
              status: event.status,
              updatedAt: event.updatedAt ?? new Date().toISOString(),
            }),
          };
        });
      },
      removeTask: async (id) => {
        try {
          await deleteTaskApi(id);
        } catch {
          // Task may not exist in backend (stale localStorage); remove locally anyway
        }
        set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
      },
      clearTask: async (id) => {
        await get().removeTask(id);
      },
      getTasksByAgent: (agentId) => get().tasks.filter((task) => task.assignedTo === agentId),
    }),
    {
      name: 'pixdash-tasks',
      partialize: (state) => ({ tasks: state.tasks }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
          void state.loadTasks().catch(() => undefined);
        }
      },
    },
  ),
);

void useTasksStore.getState().loadTasks().catch(() => undefined);
