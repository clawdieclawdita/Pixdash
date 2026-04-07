import { cn } from '@/lib/utils';
import type { AgentStatus as AgentStatusType } from '@/lib/api';

interface AgentStatusProps {
  status: AgentStatusType;
}

const statusConfig: Record<AgentStatusType, { dotClass: string; labelClass: string; label: string }> = {
  working: {
    dotClass: 'bg-[#6dbd72] animate-agent-status-working',
    labelClass: 'text-[#6dbd72]',
    label: 'Working'
  },
  online: {
    dotClass: 'bg-[#6dbd72]',
    labelClass: 'text-[#6dbd72]',
    label: 'Online'
  },
  idle: {
    dotClass: 'bg-amber-400',
    labelClass: 'text-amber-200',
    label: 'Idle'
  },
  busy: {
    dotClass: 'bg-rose-500',
    labelClass: 'text-rose-300',
    label: 'Busy'
  },
  conference: {
    dotClass: 'bg-sky-400 animate-agent-status-working',
    labelClass: 'text-sky-200',
    label: 'Conference'
  },
  offline: {
    dotClass: 'bg-slate-500',
    labelClass: 'text-slate-300',
    label: 'Offline'
  }
};

export function AgentStatus({ status }: AgentStatusProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
      <style>{`@keyframes agent-status-working-pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } } .animate-agent-status-working { animation: agent-status-working-pulse 1.5s ease-in-out infinite; }`}</style>
      <span
        className={cn('h-2.5 w-2.5 rounded-full', config.dotClass)}
        aria-hidden="true"
      />
      <span className={config.labelClass}>{config.label}</span>
    </div>
  );
}
