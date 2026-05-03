import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserTask, UserTaskStatus } from '@pixdash/shared';

interface TasksState {
  tasks: UserTask[];
  addTask: (task: Omit<UserTask, 'id' | 'createdAt' | 'updatedAt'>) => UserTask;
  updateTaskStatus: (id: string, status: UserTaskStatus) => void;
  removeTask: (id: string) => void;
  getTasksByAgent: (agentId: string) => UserTask[];
}

const makeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [],
      addTask: (task) => {
        const now = new Date().toISOString();
        const createdTask: UserTask = {
          ...task,
          id: makeId(),
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({ tasks: [createdTask, ...state.tasks] }));
        return createdTask;
      },
      updateTaskStatus: (id, status) => {
        const now = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, status, updatedAt: now } : task,
          ),
        }));
      },
      removeTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
      },
      getTasksByAgent: (agentId) => get().tasks.filter((task) => task.assignedTo === agentId),
    }),
    {
      name: 'pixdash-tasks',
      partialize: (state) => ({ tasks: state.tasks }),
    },
  ),
);
