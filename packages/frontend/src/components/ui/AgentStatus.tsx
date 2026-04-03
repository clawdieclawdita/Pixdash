import { cn } from '@/lib/utils';
import type { AgentStatus as AgentStatusType } from '@/lib/api';

interface AgentStatusProps {
  status: AgentStatusType;
}

const statusClasses: Record<AgentStatusType, string> = {
  online: 'bg-emerald-500 text-emerald-300',
  idle: 'bg-amber-400 text-amber-200',
  busy: 'bg-rose-500 text-rose-300',
  offline: 'bg-slate-500 text-slate-300'
};

export function AgentStatus({ status }: AgentStatusProps) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium capitalize text-slate-200">
      <span
        className={cn('h-2.5 w-2.5 rounded-full', statusClasses[status].split(' ')[0])}
        aria-hidden="true"
      />
      <span className={statusClasses[status].split(' ')[1]}>{status}</span>
    </div>
  );
}
