import { useMemo, useState } from 'react';
import { useTimezone } from '@/hooks/useTimezone';
import { cn } from '@/lib/utils';

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

interface LogViewerProps {
  logs: LogEntry[];
}

const levels: Array<'all' | LogEntry['level']> = ['all', 'debug', 'info', 'warn', 'error'];

const levelClasses: Record<LogEntry['level'], string> = {
  debug: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200'
};

export function LogViewer({ logs }: LogViewerProps) {
  const [levelFilter, setLevelFilter] = useState<(typeof levels)[number]>('all');
  const { formatTimestamp } = useTimezone();

  const filteredLogs = useMemo(() => {
    const sorted = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return levelFilter === 'all' ? sorted : sorted.filter((log) => log.level === levelFilter);
  }, [levelFilter, logs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setLevelFilter(level)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition',
              levelFilter === level
                ? 'border-slate-500 bg-slate-800 text-white'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            )}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        {filteredLogs.length === 0 ? (
          <div className="p-3 text-sm text-slate-400">No logs available.</div>
        ) : (
          filteredLogs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className={cn('rounded-lg border p-3', levelClasses[log.level])}>
              <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wide">
                <span>{log.level}</span>
                <span className="text-slate-400">{formatTimestamp(log.timestamp)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-100">{log.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
