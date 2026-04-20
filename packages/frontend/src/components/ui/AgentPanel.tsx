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
  const setDisplayName = useAgentsStore((state) => state.setDisplayName);
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
  const [displayNameDraft, setDisplayNameDraft] = useState('');

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

  useEffect(() => {
    setDisplayNameDraft(displayAgent?.displayName ?? '');
  }, [displayAgent?.id, displayAgent?.displayName]);

  const saveDisplayName = async () => {
    if (!displayAgent) return;
    const normalized = displayNameDraft.trim();
    await setDisplayName(displayAgent.id, normalized.length > 0 ? normalized : null);
  };

  return (
    <aside
      className={cn(
        'flex h-full min-h-[600px] w-full flex-col bg-[#0b090d]/95 backdrop-blur'
      )}
      aria-hidden={!open}
    >
      <div className="border-b border-[#d1a45a]/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#9c907f]">Agent panel</p>
            <h2 className="mt-3 font-display text-lg leading-relaxed text-white">{displayAgent?.displayName ?? displayAgent?.name ?? 'No agent selected'}</h2>
            {displayAgent ? <div className="mt-3"><AgentStatus status={displayAgent.status} /></div> : null}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="pixel-button rounded-[10px] bg-[#1a140f] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f0d6a5] transition hover:brightness-110"
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
                'pixel-button rounded-[10px] px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition',
                panelTab === tab
                  ? 'bg-[#d1a45a]/18 text-[#f0d6a5]'
                  : 'bg-[#100d11] text-[#9c907f] hover:text-[#f0d6a5]'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!displayAgent ? (
          <div className="rounded-[14px] border border-dashed border-[#d1a45a]/25 bg-[#100d11]/80 p-4 text-sm text-[#9c907f]">
            Click an agent to inspect its status, config, logs, and tasks.
          </div>
        ) : isLoading ? (
          <div className="rounded-[14px] border border-dashed border-[#d1a45a]/25 bg-[#100d11]/80 p-4 text-sm text-[#9c907f]">
            Loading live agent data…
          </div>
        ) : error ? (
          <div className="pixel-inset rounded-[14px] border-[#ff5b5b]/35 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : panelTab === 'status' ? (
          <div className="space-y-4">
            <div className="pixel-inset rounded-[14px] bg-[#100d11]/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9c907f]">Agent ID</div>
              <div className="mt-2 break-all font-mono text-sm text-slate-200">{displayAgent.id}</div>
            </div>
            <div className="pixel-inset rounded-[14px] bg-[#100d11]/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9c907f]">Last seen</div>
              <div className="mt-2 text-sm text-slate-200">{displayAgent.lastSeen ? formatTimestamp(displayAgent.lastSeen) : 'Unavailable'}</div>
            </div>
            <div className="pixel-inset rounded-[14px] bg-[#100d11]/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9c907f]">Position</div>
              <div className="mt-2 text-sm text-slate-200">
                X: {displayAgent.position?.x ?? '—'} · Y: {displayAgent.position?.y ?? '—'}
              </div>
            </div>
            <div className="pixel-inset rounded-[14px] bg-[#100d11]/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9c907f]">Display Name</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={displayNameDraft}
                  onChange={(e) => setDisplayNameDraft(e.target.value)}
                  onBlur={() => { void saveDisplayName(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void saveDisplayName();
                    }
                  }}
                  placeholder={displayAgent.name}
                  className="pixel-inset flex-1 rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#d1a45a]/50 focus:outline-none"
                />
                {(displayAgent.displayName || displayNameDraft) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDisplayNameDraft('');
                      void setDisplayName(displayAgent.id, null);
                    }}
                    className="pixel-button rounded-[10px] bg-[#100d11] px-2 py-1.5 text-sm text-slate-400 hover:text-slate-200"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCustomize}
              className="pixel-button w-full rounded-[12px] bg-[#d1a45a]/14 px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-[#f2dfba] transition hover:brightness-110"
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
