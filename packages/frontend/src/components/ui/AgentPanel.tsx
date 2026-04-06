import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '@/lib/api';
import { getAgent, getAgentLogs, getAgentTasks } from '@/lib/api';
import { useTimezone } from '@/hooks/useTimezone';
import { cn } from '@/lib/utils';
import { useAgentsStore } from '@/store/agentsStore';
import { useUIStore, type PanelTab } from '@/store/uiStore';
import { AgentStatus } from '@/components/ui/AgentStatus';
import { ConfigViewer } from '@/components/ui/ConfigViewer';
import { LogViewer, type LogEntry } from '@/components/ui/LogViewer';
import { TaskViewer, type TaskEntry } from '@/components/ui/TaskViewer';

interface AgentPanelProps {
  agent?: Agent | null;
  isOpen?: boolean;
  onClose?: () => void;
  onCustomize?: () => void;
}

const tabs: PanelTab[] = ['status', 'config', 'logs', 'tasks'];

export function AgentPanel({ agent: externalAgent, isOpen, onClose, onCustomize }: AgentPanelProps = {}) {
  const agents = useAgentsStore((state) => state.agents);
  const selectedAgentId = useAgentsStore((state) => state.selectedAgentId);
  const clearSelection = useAgentsStore((state) => state.clearSelection);
  const panelOpen = useUIStore((state) => state.panelOpen);
  const panelTab = useUIStore((state) => state.panelTab);
  const closePanel = useUIStore((state) => state.closePanel);
  const setPanelTab = useUIStore((state) => state.setPanelTab);
  const openCustomizer = useUIStore((state) => state.openCustomizer);
  const { formatTimestamp } = useTimezone();

  const selectedAgent = useMemo(() => {
    if (externalAgent) {
      return agents.find((currentAgent) => currentAgent.id === externalAgent.id) ?? externalAgent;
    }

    if (!selectedAgentId) {
      return null;
    }

    return agents.find((currentAgent) => currentAgent.id === selectedAgentId) ?? null;
  }, [agents, externalAgent, selectedAgentId]);

  const [agentDetails, setAgentDetails] = useState<Agent | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAgent?.id) {
      setAgentDetails(null);
      setLogs([]);
      setTasks([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    const loadPanelData = async () => {
      try {
        const [details, logsResponse, tasksResponse] = await Promise.all([
          getAgent(selectedAgent.id),
          getAgentLogs(selectedAgent.id).catch(() => ({ logs: [], total: 0, hasMore: false })),
          getAgentTasks(selectedAgent.id).catch(() => ({ tasks: [] }))
        ]);

        if (mounted) {
          setAgentDetails(details);
          setLogs(logsResponse.logs.map((log) => ({ timestamp: log.timestamp, level: log.level, message: log.message })));
          setTasks(tasksResponse.tasks);
        }
      } catch (loadError) {
        if (mounted) {
          setAgentDetails(null);
          setLogs([]);
          setTasks([]);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load agent details');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadPanelData();

    return () => {
      mounted = false;
    };
  }, [selectedAgent?.id]);

  const open = typeof isOpen === 'boolean' ? isOpen : panelOpen;

  const handleClose = () => {
    closePanel();
    clearSelection();
    onClose?.();
  };

  const handleCustomize = () => {
    openCustomizer();
    onCustomize?.();
  };

  // Merge live store data (WebSocket-updated status) with fetched details
  const displayAgent = useMemo(() => {
    if (!agentDetails) return selectedAgent;
    const liveAgent = agents.find((a) => a.id === agentDetails.id) ?? selectedAgent;
    return { ...agentDetails, status: liveAgent?.status ?? agentDetails.status };
  }, [agentDetails, selectedAgent, agents]);

  return (
    <aside
      className={cn(
        'flex h-full min-h-[600px] w-full flex-col bg-slate-950/95 shadow-2xl backdrop-blur'
      )}
      aria-hidden={!open}
    >
      <div className="border-b border-slate-800 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Agent panel</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{displayAgent?.name ?? 'No agent selected'}</h2>
            {displayAgent ? <div className="mt-3"><AgentStatus status={displayAgent.status} /></div> : null}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPanelTab(tab)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition',
                panelTab === tab
                  ? 'border-slate-500 bg-slate-800 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!displayAgent ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
            Click an agent to inspect its status, config, logs, and tasks.
          </div>
        ) : isLoading ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
            Loading live agent data…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : panelTab === 'status' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Agent ID</div>
              <div className="mt-2 break-all font-mono text-sm text-slate-200">{displayAgent.id}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Last seen</div>
              <div className="mt-2 text-sm text-slate-200">{displayAgent.lastSeen ? formatTimestamp(displayAgent.lastSeen) : 'Unavailable'}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Position</div>
              <div className="mt-2 text-sm text-slate-200">
                X: {displayAgent.position?.x ?? '—'} · Y: {displayAgent.position?.y ?? '—'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCustomize}
              className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/15"
            >
              Customize
            </button>
          </div>
        ) : panelTab === 'config' ? (
          <ConfigViewer config={agentDetails?.config ?? displayAgent.config ?? {}} />
        ) : panelTab === 'logs' ? (
          <LogViewer logs={logs} />
        ) : (
          <TaskViewer tasks={tasks} />
        )}
      </div>
    </aside>
  );
}
