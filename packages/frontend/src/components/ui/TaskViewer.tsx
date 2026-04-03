import { useTimezone } from '@/hooks/useTimezone';

export interface TaskEntry {
  id: string;
  type: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskViewerProps {
  tasks: TaskEntry[];
}

const badgeClasses: Record<string, string> = {
  running: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  failed: 'border-rose-500/30 bg-rose-500/10 text-rose-200'
};

export function TaskViewer({ tasks }: TaskViewerProps) {
  const { formatTimestamp } = useTimezone();
  const sortedTasks = [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (sortedTasks.length === 0) {
    return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">No tasks available.</div>;
  }

  return (
    <div className="space-y-3">
      {sortedTasks.map((task) => (
        <div key={task.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">{task.description}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{task.type}</div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${badgeClasses[task.status] ?? 'border-slate-700 bg-slate-800 text-slate-200'}`}>
              {task.status}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <div>Created: {formatTimestamp(task.createdAt)}</div>
            <div>Updated: {formatTimestamp(task.updatedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
