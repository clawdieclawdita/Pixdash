import { useState } from 'react';
import type { UserTask } from '@pixdash/shared';
import { TaskCard } from '@/components/tasks/TaskCard';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { EditTaskModal } from '@/components/tasks/EditTaskModal';
import { useTasksStore } from '@/store/tasksStore';
import { executeTask } from '@/lib/api';

export function TasksView() {
  const tasks = useTasksStore((state) => state.tasks);
  const addTask = useTasksStore((state) => state.addTask);
  const updateTask = useTasksStore((state) => state.updateTask);
  const updateTaskStatus = useTasksStore((state) => state.updateTaskStatus);
  const clearTask = useTasksStore((state) => state.clearTask);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<UserTask | null>(null);

  const setTaskStatus = async (id: string, status: UserTask['status']) => {
    try {
      const updated = await updateTaskStatus(id, status);
      if (!updated) {
        return;
      }
    } catch {
      await updateTaskStatus(id, 'failed').catch(() => undefined);
    }
  };

  const addAndExecuteTask = async (task: Parameters<typeof addTask>[0]) => {
    const created = await addTask(task);

    if (task.status !== 'running') {
      return;
    }

    try {
      const result = await executeTask(task.assignedTo, task.description, task.name, created.id, task.replySession);
      if (!result.success) {
        await updateTaskStatus(created.id, 'failed').catch(() => undefined);
      }
    } catch {
      await updateTaskStatus(created.id, 'failed').catch(() => undefined);
    }
  };

  const restartTask = async (task: UserTask) => {
    await updateTask(task.id, { status: 'running' });

    try {
      const result = await executeTask(task.assignedTo, task.description, task.name, task.id, task.replySession);
      if (!result.success) {
        await updateTaskStatus(task.id, 'failed').catch(() => undefined);
      }
    } catch {
      await updateTaskStatus(task.id, 'failed').catch(() => undefined);
    }
  };

  return (
    <section className="pixel-frame crt-panel rounded-[18px] bg-[linear-gradient(180deg,rgba(15,12,16,0.98),rgba(9,8,11,0.98))] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Task Operations</div>
          <h2 className="mt-2 font-display text-xl text-white">Agent Tasks</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="pixel-button rounded-[10px] bg-[#d1a45a]/16 px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-[#f0d6a5] transition-all duration-200 hover:brightness-110"
        >
          CREATE TASK
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[#d1a45a]/25 bg-[#100d11]/80 px-4 py-8 text-center text-sm text-[#b7aa96]">
          No tasks yet. Create your first task to assign work to an agent.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClear={() => void clearTask(task.id)}
              onEdit={() => setEditingTask(task)}
              onCancel={() => void setTaskStatus(task.id, 'failed')}
            />
          ))}
        </div>
      )}

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onCreateTask={addAndExecuteTask} />
      {editingTask ? (
        <EditTaskModal
          isOpen={editingTask !== null}
          onClose={() => setEditingTask(null)}
          task={editingTask}
          onUpdate={(id, updates) => void updateTask(id, updates)}
          onRestart={(task) => void restartTask(task)}
          onCancelTask={(id) => void setTaskStatus(id, 'failed')}
        />
      ) : null}
    </section>
  );
}
