import { useMemo } from 'react';
import type { UserTask } from '@pixdash/shared';
import { useAgentsStore } from '@/store/agentsStore';

interface TaskCardProps {
  task: UserTask;
  onClear?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
}

const noop = () => {};

const statusStyles: Record<UserTask['status'], string> = {
  pending: 'border-amber-400/50 bg-amber-500/15 text-amber-200',
  scheduled: 'border-violet-400/50 bg-violet-500/15 text-violet-200',
  running: 'border-sky-400/50 bg-sky-500/15 text-sky-200',
  completed: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200',
  failed: 'border-rose-400/50 bg-rose-500/15 text-rose-200',
};

const actionButtonBase = 'pixel-button rounded-[10px] border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition hover:brightness-110';
const clearButtonStyle = 'bg-rose-500/15 text-rose-200 border-rose-400/30';
const editButtonStyle = 'bg-sky-500/15 text-sky-200 border-sky-400/30';
const cancelButtonStyle = 'bg-amber-500/15 text-amber-200 border-amber-400/30';

export function TaskCard({ task, onClear = noop, onEdit = noop, onCancel = noop }: TaskCardProps) {
  const agents = useAgentsStore((state) => state.agents);

  const assignedAgentName = useMemo(() => {
    const agent = agents.find((entry) => entry.id === task.assignedTo);
    return agent?.displayName ?? agent?.name ?? task.assignedTo;
  }, [agents, task.assignedTo]);

  const isFinished = task.status === 'completed' || task.status === 'failed';
  const canClear = isFinished || task.status === 'pending' || task.status === 'scheduled';
  const canCancel = task.status === 'running';

  return (
    <article className="pixel-frame rounded-[14px] border border-slate-800 bg-slate-950/70 p-4 transition-all duration-200 hover:brightness-110">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-sm uppercase tracking-[0.18em] text-[#f2dfba]">{task.name}</h3>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusStyles[task.status]}`}>
          {task.status}
        </span>
      </div>

      <p className="mt-3 line-clamp-3 text-sm text-slate-200">{task.description}</p>

      <div className="mt-4 border-t border-slate-800/80 pt-3 text-xs text-[#b7aa96]">
        <div>Assigned: <span className="text-slate-100">{assignedAgentName}</span></div>
        {task.scheduledAt ? <div className="mt-1">Scheduled: <span className="text-slate-100">{new Date(task.scheduledAt).toLocaleString()}</span></div> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
        {canClear ? (
          <button type="button" onClick={onClear} className={`${actionButtonBase} ${clearButtonStyle}`}>
            Clear
          </button>
        ) : null}
        <button type="button" onClick={onEdit} className={`${actionButtonBase} ${editButtonStyle}`}>
          Edit
        </button>
        {canCancel ? (
          <button type="button" onClick={onCancel} className={`${actionButtonBase} ${cancelButtonStyle}`}>
            Cancel
          </button>
        ) : null}
      </div>
    </article>
  );
}
