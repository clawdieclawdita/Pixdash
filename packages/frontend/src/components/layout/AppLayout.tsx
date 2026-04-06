import { OfficeCanvas } from '@/components/canvas/OfficeCanvas';
import { invalidateRendererSpriteCache } from '@/components/canvas/AgentRenderer';
import { clearSpriteCache } from '@/hooks/useSprites';
import { AgentPanel } from '@/components/ui/AgentPanel';
import { CustomizerModal } from '@/components/ui/CustomizerModal';
import { updateAppearance } from '@/lib/api';
import { AgentStatus } from '@/components/ui/AgentStatus';
import { useTimezone } from '@/hooks/useTimezone';
import { agentsStore, useAgentsStore } from '@/store/agentsStore';
import { uiStore, useUIStore } from '@/store/uiStore';
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
      await updateAppearance(selectedAgentId, appearance);
      agentsStore.updateAgent({
        id: selectedAgentId,
        appearance,
        color: appearance.outfit.color
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
        <header className="flex items-center justify-between rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(34,28,23,0.94),rgba(17,17,20,0.92))] px-6 py-4 shadow-panel shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div>
              <p className="mb-1 inline-flex items-center rounded-full border border-[#d1a45a]/30 bg-[#d1a45a]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f0d6a5]">
                SNES agent theatre
              </p>
              <h1 className="font-display text-3xl font-bold tracking-[-0.04em] text-white">PixDash</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-stretch gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#b7aa96]">Agents</div>
                <div className="text-2xl font-semibold leading-tight text-[#9fd28f]">{totalAgentCount}</div>
                <div className="mt-1 text-xs text-[#b7aa96]">{onlineAgentCount} online</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#b7aa96]">Realtime</div>
                <div className="mt-1 flex items-center justify-end gap-2 text-sm text-white">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      connectionState === 'connected'
                        ? 'bg-emerald-400'
                        : connectionState === 'connecting'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                    }`}
                  />
                  {connectionLabel[connectionState]}
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="relative min-h-[600px]">
            <>
              <OfficeCanvas
                agents={agents}
                onAgentSelect={handleAgentSelect}
                selectedAgentId={selectedAgentId}
              />
              {isAgentsLoading ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[28px] bg-black/45 backdrop-blur-sm">
                  <div className="rounded-2xl border border-white/10 bg-black/60 px-5 py-4 text-sm text-[#ddd4c8]">
                    Loading live office data…
                  </div>
                </div>
              ) : null}
              {!isAgentsLoading && agents.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-6 top-6 rounded-2xl border border-dashed border-white/15 bg-black/45 px-4 py-3 text-sm text-[#ddd4c8] backdrop-blur-sm">
                  No agents connected.
                </div>
              ) : null}
            </>
          </div>

          {panelOpen ? (
            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,16,18,0.92),rgba(11,11,14,0.95))] shadow-panel shadow-black/30">
              <AgentPanel
                agent={selectedAgent}
                onClose={handleClosePanel}
                onCustomize={handleOpenCustomizer}
              />
            </div>
          ) : (
            <aside
              className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,16,18,0.92),rgba(11,11,14,0.95))] p-5 shadow-panel shadow-black/30"
            >
            <div className="mb-6">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#9c907f]">Scene info</div>
              <h3 className="mt-2 text-xl font-semibold text-white">Office layout</h3>
            </div>

            <div className="space-y-3 text-sm text-[#d8d0c3]">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-[#9c907f]">Controls</div>
                <div className="mt-2 text-white">Drag to pan · Scroll to zoom · Click agents</div>
              </div>

              {agentsError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-rose-200">
                  Agent API error: {agentsError}
                </div>
              ) : null}

              {socketError ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-amber-100">
                  {socketError}
                </div>
              ) : null}
            </div>

            <div className="mt-6">
              <div className="mb-4 text-[11px] uppercase tracking-[0.24em] text-[#9c907f]">Agent roster</div>
              {isAgentsLoading ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-[#b7aa96]">
                  Loading agents…
                </div>
              ) : agents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-[#b7aa96]">
                  No agents connected.
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => handleAgentSelect(agent)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:border-white/20 ${
                        selectedAgentId === agent.id
                          ? 'border-[#d1a45a]/50 bg-[#d1a45a]/10'
                          : 'border-white/10 bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 rounded-full border border-black/20"
                            style={{ backgroundColor: agent.color }}
                          />
                          <span className="text-white">{agent.name}</span>
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
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#9c907f]">Settings</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[#9c907f]">Timezone</span>
                  <select
                    value={timezone}
                    onChange={(event) => changeTimezone(event.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50"
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
            </div>
          </aside>
          )}
        </section>
      </div>

      <CustomizerModal agent={selectedAgent} isOpen={isCustomizerOpen} onClose={handleCloseCustomizer} onSave={handleSaveAppearance} />
    </main>
  );
};
