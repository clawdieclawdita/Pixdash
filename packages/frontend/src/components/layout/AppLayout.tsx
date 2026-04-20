import { useState, useEffect } from 'react';
import { OfficeCanvas } from '@/components/canvas/OfficeCanvas';
import { invalidateRendererSpriteCache } from '@/components/canvas/AgentRenderer';
import { clearSpriteCache } from '@/hooks/useSprites';
import { AgentPanel } from '@/components/ui/AgentPanel';
import { CustomizerModal } from '@/components/ui/CustomizerModal';
import { updateAppearance } from '@/lib/api';
import { AgentStatus } from '@/components/ui/AgentStatus';
import { useTimezone } from '@/hooks/useTimezone';
import { useSettingsStore } from '@/store/settingsStore';
import { useConfigStore } from '@/store/configStore';
import { agentsStore, useAgentsStore } from '@/store/agentsStore';
import { uiStore, useUIStore } from '@/store/uiStore';
import { NavigationSwitch, type ViewMode } from '@/components/staff/NavigationSwitch';
import { StaffView } from '@/components/staff/StaffView';
import type { AgentPosition } from '@/types';
import type { Appearance } from '@pixdash/shared';

interface AppLayoutProps {
  agents: AgentPosition[];
  isAgentsLoading: boolean;
  agentsError: string | null;
  connectionState: 'connecting' | 'connected' | 'disconnected';
  socketError: string | null;
}

const connectionLabel: Record<AppLayoutProps['connectionState'], string> = {
  connecting: 'Connecting',
  connected: 'Live',
  disconnected: 'Disconnected'
};

export const AppLayout = ({
  agents,
  isAgentsLoading,
  agentsError,
  connectionState,
  socketError
}: AppLayoutProps) => {
  const { agents: storeAgents, selectedAgentId } = useAgentsStore();
  const { isCustomizerOpen, panelOpen } = useUIStore();
  const { timezone, changeTimezone } = useTimezone();
  const { showLabels, setShowLabels } = useSettingsStore();

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('pixdash-view') as ViewMode) ?? 'office';
  });

  useEffect(() => {
    localStorage.setItem('pixdash-view', viewMode);
  }, [viewMode]);

  const { fetchConfig } = useConfigStore();

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const onlineAgentCount = agents.filter((agent) => agent.status !== 'offline').length;
  const totalAgentCount = agents.length;

  const handleAgentSelect = (agent: AgentPosition | null) => {
    agentsStore.selectAgent(agent?.id ?? null);
    if (agent) {
      uiStore.openPanel();
    } else {
      uiStore.closePanel();
    }
  };

  const handleClosePanel = () => {
    agentsStore.selectAgent(null);
    uiStore.closePanel();
  };

  const handleOpenCustomizer = () => {
    uiStore.openCustomizer();
  };

  const handleCloseCustomizer = () => {
    uiStore.closeCustomizer();
  };

  const handleSaveAppearance = async (appearance: Appearance) => {
    if (!selectedAgentId) return;
    try {
      const response = await updateAppearance(selectedAgentId, appearance);
      const nextAppearance = response.appearance ?? appearance;
      agentsStore.updateAgent({
        id: selectedAgentId,
        appearance: nextAppearance,
        bodyType: nextAppearance.bodyType,
        color: nextAppearance.outfit.color
      });
      invalidateRendererSpriteCache();
      clearSpriteCache();
    } catch (err) {
      console.error('[PixDash] Failed to save appearance:', err);
    }
    uiStore.closeCustomizer();
  };

  const selectedAgent = storeAgents.find((agent) => agent.id === selectedAgentId) ?? null;

  return (
    <main className="min-h-screen px-6 py-8 md:px-10">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-6">
        <header className="pixel-frame crt-panel flex items-center justify-between rounded-[18px] bg-[linear-gradient(135deg,rgba(33,24,18,0.97),rgba(14,12,16,0.98))] px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl leading-tight text-white [text-shadow:0_0_14px_rgba(209,164,90,0.28)] md:text-3xl">PixDash</h1>
              <p className="mt-2 inline-flex items-center bg-[#1a140f] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-[#f0d6a5] pixel-frame">
                Retro Office Dashboard
              </p>
            </div>
            <NavigationSwitch value={viewMode} onChange={setViewMode} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-stretch gap-4">
              <div className="pixel-frame rounded-[14px] bg-[linear-gradient(180deg,rgba(24,19,16,0.96),rgba(12,11,14,0.98))] px-5 py-3 text-right">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#b7aa96]">Agents</div>
                <div className="mt-2 text-2xl font-bold leading-tight text-[#00d4aa]">{totalAgentCount}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#b7aa96]">{onlineAgentCount} online</div>
              </div>
              <div className="pixel-frame rounded-[14px] bg-[linear-gradient(180deg,rgba(24,19,16,0.96),rgba(12,11,14,0.98))] px-5 py-3 text-right">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#b7aa96]">Realtime</div>
                <div className="mt-1 flex items-center justify-end gap-2 text-sm text-white">
                  <span
                    className={`h-3 w-3 border border-[#2a2520] ${
                      connectionState === 'connected'
                        ? 'bg-[#00d4aa] animate-status-blink'
                        : connectionState === 'connecting'
                          ? 'bg-amber-400'
                          : 'bg-[#ff5b5b]'
                    }`}
                  />
                  {connectionLabel[connectionState]}
                </div>
              </div>
            </div>
          </div>
        </header>

        {viewMode === 'staff' ? (
          <StaffView />
        ) : (
        <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="relative h-[70vh]">
            <>
              <OfficeCanvas
                agents={agents}
                onAgentSelect={handleAgentSelect}
                selectedAgentId={selectedAgentId}
                showLabels={showLabels}
              />
              {isAgentsLoading ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[28px] bg-black/45 backdrop-blur-sm">
                  <div className="pixel-frame rounded-[14px] bg-[#0d0a0f]/95 px-5 py-4 text-sm text-[#ddd4c8]">
                    Loading live office data…
                  </div>
                </div>
              ) : null}
              {!isAgentsLoading && agents.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-6 top-6 rounded-[14px] border border-dashed border-[#d1a45a]/35 bg-black/60 px-4 py-3 text-sm text-[#ddd4c8] backdrop-blur-sm">
                  No agents connected.
                </div>
              ) : null}
            </>
          </div>

          {panelOpen ? (
            <div className="pixel-frame crt-panel rounded-[18px] flex flex-col bg-[linear-gradient(180deg,rgba(15,12,16,0.98),rgba(9,8,11,0.98))] h-[70vh] overflow-y-auto">
              <AgentPanel
                agent={selectedAgent}
                onClose={handleClosePanel}
                onCustomize={handleOpenCustomizer}
              />
            </div>
          ) : (
            <aside
              className="pixel-frame crt-panel rounded-[18px] flex flex-col bg-[linear-gradient(180deg,rgba(15,12,16,0.98),rgba(9,8,11,0.98))] p-5 h-[70vh] overflow-y-auto"
            >
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#9c907f]">Scene info</div>
              <h3 className="mt-3 font-display text-lg text-white">Office layout</h3>
            </div>

            <div className="space-y-3 text-sm text-[#d8d0c3]">
              <div className="pixel-inset rounded-[14px] bg-white/[0.03] px-4 py-3">
                <div className="text-[#9c907f]">Controls</div>
                <div className="mt-2 text-white">Drag to pan · Scroll to zoom · Click agents</div>
              </div>

              {agentsError ? (
                <div className="pixel-inset rounded-[14px] border-[#ff5b5b]/35 bg-[#ff5b5b]/10 px-4 py-3 text-rose-200">
                  Agent API error: {agentsError}
                </div>
              ) : null}

              {socketError ? (
                <div className="pixel-inset rounded-[14px] border-amber-500/35 bg-amber-500/10 px-4 py-3 text-amber-100">
                  {socketError}
                </div>
              ) : null}
            </div>

            <div className="mt-6">
              <div className="mb-4 text-[10px] uppercase tracking-[0.28em] text-[#9c907f]">Agent roster</div>
              {isAgentsLoading ? (
                <div className="rounded-[14px] border border-dashed border-[#d1a45a]/25 bg-white/[0.03] px-4 py-5 text-sm text-[#b7aa96]">
                  Loading agents…
                </div>
              ) : agents.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#d1a45a]/25 bg-white/[0.03] px-4 py-5 text-sm text-[#b7aa96]">
                  No agents connected.
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => handleAgentSelect(agent)}
                      className={`pixel-frame w-full rounded-[14px] px-4 py-3 text-left transition hover:brightness-110 ${
                        selectedAgentId === agent.id
                          ? 'bg-[#d1a45a]/12'
                          : 'bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 rounded-full border border-black/20"
                            style={{ backgroundColor: agent.color }}
                          />
                          <span className="text-white">{agent.displayName ?? agent.name}</span>
                        </div>
                        <AgentStatus status={agent.status} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#9c907f]">Settings</div>
              </div>
              <div className="pixel-inset rounded-[14px] bg-white/[0.03] px-4 py-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[#9c907f]">Timezone</span>
                  <select
                    value={timezone}
                    onChange={(event) => changeTimezone(event.target.value)}
                    className="pixel-inset rounded-[10px] bg-[#0e0a10] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50"
                  >
                    <option value="local">Local</option>
                    <option value="UTC">UTC</option>
                    <option value="America/Buenos_Aires">Buenos Aires (GMT-3)</option>
                    <option value="America/New_York">New York (GMT-5)</option>
                    <option value="America/Los_Angeles">Los Angeles (GMT-8)</option>
                    <option value="Europe/London">London (GMT+0)</option>
                    <option value="Europe/Berlin">Berlin (GMT+1)</option>
                    <option value="Europe/Madrid">Madrid (GMT+1)</option>
                    <option value="Asia/Tokyo">Tokyo (GMT+9)</option>
                    <option value="Asia/Shanghai">Shanghai (GMT+8)</option>
                    <option value="Australia/Sydney">Sydney (GMT+10)</option>
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <div className="pixel-inset rounded-[14px] bg-white/[0.03] px-4 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[#9c907f]">Agent Names</span>
                    <button
                      type="button"
                      onClick={() => setShowLabels(!showLabels)}
                      className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${showLabels ? 'bg-[#d1a45a]/60' : 'bg-white/10'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${showLabels ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
          )}
        </section>
        )}
      </div>

      <CustomizerModal agent={selectedAgent} isOpen={isCustomizerOpen} onClose={handleCloseCustomizer} onSave={handleSaveAppearance} />
    </main>
  );
};
