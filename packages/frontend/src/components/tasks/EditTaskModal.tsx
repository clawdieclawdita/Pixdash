import { useEffect, useMemo, useState } from 'react';
import type { UserTask } from '@pixdash/shared';
import { useAgentsStore } from '@/store/agentsStore';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: UserTask;
  onUpdate: (id: string, updates: Partial<Pick<UserTask, 'description' | 'name'>>) => void | Promise<void>;
  onRestart: (task: UserTask) => void;
  onCancelTask: (id: string) => void;
}

const statusStyles: Record<UserTask['status'], string> = {
  pending: 'border-amber-400/50 bg-amber-500/15 text-amber-200',
  scheduled: 'border-violet-400/50 bg-violet-500/15 text-violet-200',
  running: 'border-sky-400/50 bg-sky-500/15 text-sky-200',
  completed: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200',
  failed: 'border-rose-400/50 bg-rose-500/15 text-rose-200',
};

export function EditTaskModal({ isOpen, onClose, task, onUpdate, onRestart, onCancelTask }: EditTaskModalProps) {
  const agents = useAgentsStore((state) => state.agents);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description);

  useEffect(() => {
    if (!isOpen) return;
    setName(task.name);
    setDescription(task.description);
  }, [isOpen, task]);

  const assignedAgentName = useMemo(() => {
    const agent = agents.find((entry) => entry.id === task.assignedTo);
    return agent?.displayName ?? agent?.name ?? task.assignedTo;
  }, [agents, task.assignedTo]);

  if (!isOpen) return null;

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const descriptionChanged = trimmedDescription !== task.description;
  const canSave = trimmedName.length > 0 && trimmedDescription.length > 0;

  const handleSaveAndRestart = () => {
    if (!canSave) return;

    const updatedTask: UserTask = {
      ...task,
      name: trimmedName,
      description: trimmedDescription,
      updatedAt: new Date().toISOString(),
    };

    onUpdate(task.id, {
      name: trimmedName,
      description: trimmedDescription,
    });

    if (descriptionChanged) {
      onRestart(updatedTask);
    }

    onClose();
  };

  const handleCancelTask = () => {
    onCancelTask(task.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="pixel-frame crt-panel w-full max-w-2xl rounded-[18px] bg-[#0f0b10]">
        <div className="flex items-center justify-between border-b border-[#d1a45a]/20 px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#9c907f]">Task Editor</p>
            <h2 className="mt-2 font-display text-lg text-white">Edit Task</h2>
          </div>
          <button type="button" onClick={onClose} className="pixel-button rounded-[10px] bg-[#1a140f] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f0d6a5] transition hover:brightness-110">Close</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Task Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="pixel-inset w-full rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50" />
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="pixel-inset w-full rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50" />
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Assigned Agent</label>
            <div className="pixel-inset rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-[#f2dfba]">{assignedAgentName}</div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Status</label>
            <span className={`inline-flex rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.18em] ${statusStyles[task.status]}`}>
              {task.status}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#d1a45a]/15 px-6 py-4">
          <button type="button" onClick={handleSaveAndRestart} disabled={!canSave} className="pixel-button rounded-[10px] bg-[#d1a45a]/15 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f2dfba] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            Save &amp; Restart
          </button>
          <button type="button" onClick={handleCancelTask} className="pixel-button rounded-[10px] bg-amber-500/15 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-amber-200 transition hover:brightness-110">
            Cancel Task
          </button>
          <button type="button" onClick={onClose} className="pixel-button rounded-[10px] bg-[#1a140f] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f0d6a5] transition hover:brightness-110">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
