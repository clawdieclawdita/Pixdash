import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSprites } from '@/hooks/useSprites';
import { useAllSpritePreviews } from '@/hooks/useAllSpritePreviews';
import {
  DEFAULT_SPRITE_APPEARANCE,
  type Appearance,
  type Direction
} from '@/lib/sprite-generator';
import type { AgentProfile } from '@/types';
import { type SpriteTemplate, clearSpriteTemplateCache } from '@/lib/spriteSheets';
import { useConfigStore } from '@/store/configStore';
import { useAgentsStore } from '@/store/agentsStore';

interface CustomizerModalProps {
  agent: AgentProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (appearance: Appearance) => void;
  initialAppearance?: Appearance;
}

type CharacterPreset = {
  id: SpriteTemplate;
  label: string;
  bodyType: SpriteTemplate;
  description: string;
};

const PRESETS: CharacterPreset[] = [
  {
    id: 'michael',
    label: 'Michael',
    bodyType: 'michael',
    description: 'Male character template'
  },
  {
    id: 'angela',
    label: 'Angela',
    bodyType: 'angela',
    description: 'Female character template'
  },
  {
    id: 'phillis',
    label: 'Phillis',
    bodyType: 'phillis',
    description: 'Female character template'
  },
  {
    id: 'creed',
    label: 'Creed',
    bodyType: 'creed',
    description: 'Male character template'
  },
  {
    id: 'ryan',
    label: 'Ryan',
    bodyType: 'ryan',
    description: 'Male character template'
  },
  {
    id: 'pam',
    label: 'Pam',
    bodyType: 'pam',
    description: 'Female character template'
  },
  {
    id: 'kelly',
    label: 'Kelly',
    bodyType: 'kelly',
    description: 'Female character template'
  },
  {
    id: 'kate',
    label: 'Kate',
    bodyType: 'kate',
    description: 'Female character template'
  },
  {
    id: 'pites',
    label: 'Pites',
    bodyType: 'pites',
    description: 'Male character template'
  },
  {
    id: 'jim',
    label: 'Jim',
    bodyType: 'jim',
    description: 'Male character template'
  },
  {
    id: 'clawdie',
    label: 'Clawdie',
    bodyType: 'clawdie',
    description: 'Custom Clawdie sprite template'
  }
];

const previewDirections: Direction[] = ['south', 'north', 'east', 'west'];

const DEFAULT_PRESET: SpriteTemplate = 'michael';

const PRESET_BY_BODY_TYPE: Partial<Record<string, SpriteTemplate>> = {
  michael: 'michael',
  angela: 'angela',
  phillis: 'phillis',
  creed: 'creed',
  ryan: 'ryan',
  pam: 'pam',
  kelly: 'kelly',
  kate: 'kate',
  pites: 'pites',
  jim: 'jim',
  clawdie: 'clawdie',
  male: 'michael',
  female: 'angela'
};

const getPresetFromBodyType = (bodyType: Appearance['bodyType']): SpriteTemplate =>
  PRESET_BY_BODY_TYPE[bodyType] ?? DEFAULT_PRESET;

const fallbackAppearanceFromAgent = (agent: AgentProfile | null): Appearance => ({
  ...DEFAULT_SPRITE_APPEARANCE,
  bodyType: agent?.appearance.bodyType ?? DEFAULT_SPRITE_APPEARANCE.bodyType,
  skinColor: '#E8BEAC',
  outfit: {
    type: 'casual',
    color: agent?.color ?? DEFAULT_SPRITE_APPEARANCE.outfit.color
  },
  accessories: []
});

const cloneAppearance = (appearance: Appearance): Appearance => ({
  bodyType: appearance.bodyType,
  hair: { ...appearance.hair },
  skinColor: appearance.skinColor,
  outfit: { ...appearance.outfit },
  accessories: [...(appearance.accessories ?? [])].map((a) => ({ ...a }))
});

export const CustomizerModal = ({
  agent,
  isOpen,
  onClose,
  onSave,
  initialAppearance
}: CustomizerModalProps) => {
  const baseAppearance = useMemo(
    () => cloneAppearance(initialAppearance ?? fallbackAppearanceFromAgent(agent)),
    [agent, initialAppearance]
  );

  const [draft, setDraft] = useState<Appearance>(baseAppearance);
  const [selectedPreset, setSelectedPreset] = useState<SpriteTemplate>(
    getPresetFromBodyType(baseAppearance.bodyType)
  );
  const { spriteSheet, isLoading } = useSprites(draft);
  const allPreviews = useAllSpritePreviews();
  const [frame, setFrame] = useState(0);
  const { config, updateRole, updateHierarchy } = useConfigStore();
  const { agents } = useAgentsStore();
  const wasOpenRef = useRef(false);
  const lastOpenStateKeyRef = useRef<string | null>(null);

  // Role title draft
  const [roleDraft, setRoleDraft] = useState('');
  const [parentDraft, setParentDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    const openStateKey = JSON.stringify({
      agentId: agent?.id ?? null,
      appearance: baseAppearance,
    });

    const shouldReset = !wasOpenRef.current || lastOpenStateKeyRef.current !== openStateKey;

    if (shouldReset) {
      const nextDraft = cloneAppearance(baseAppearance);
      setDraft(nextDraft);
      setSelectedPreset(getPresetFromBodyType(nextDraft.bodyType));
      // Sync role + parent drafts from config
      const currentRole = agent ? (config.roles[agent.id] ?? agent.title ?? 'Agent') : 'Agent';
      setRoleDraft(currentRole);
      const currentParent = agent ? getParentForAgent(agent.id, config.hierarchy) : null;
      setParentDraft(currentParent);
      lastOpenStateKeyRef.current = openStateKey;
    }

    wasOpenRef.current = true;
  }, [agent?.id, baseAppearance, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % 3);
    }, 350);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePresetSelect = (preset: CharacterPreset) => {
    const nextBodyType = preset.bodyType as Appearance['bodyType'];
    setSelectedPreset(preset.id);
    setDraft((current) => {
      if (current.bodyType === nextBodyType) return current;
      return {
        ...current,
        bodyType: nextBodyType
      };
    });
    clearSpriteTemplateCache();
  };

  // Parent lookup helper
  const getParentForAgent = (agentId: string, hierarchy: Array<{ parent: string; child: string }>): string | null => {
    const edge = hierarchy.find((e) => e.child === agentId);
    return edge?.parent ?? null;
  };

  const handleRoleBlur = useCallback(() => {
    if (!agent) return;
    const currentRole = config.roles[agent.id] ?? agent.title ?? 'Agent';
    if (roleDraft !== currentRole) {
      updateRole(agent.id, roleDraft);
    }
  }, [agent, roleDraft, config.roles, updateRole]);

  const handleParentChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!agent) return;
      const val = e.target.value;
      const newParent = val === '' ? null : val;
      setParentDraft(newParent);
      updateHierarchy(agent.id, newParent);
    },
    [agent, updateHierarchy],
  );

  const handleSave = () => {
    // Persist role if changed
    if (agent) {
      const currentRole = config.roles[agent.id] ?? agent.title ?? 'Agent';
      if (roleDraft !== currentRole) {
        updateRole(agent.id, roleDraft);
      }
    }
    if (onSave) {
      onSave(draft);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="pixel-frame crt-panel flex max-h-[85vh] w-full max-w-3xl flex-col rounded-[18px] bg-[#0f0b10] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-[#d1a45a]/20 px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#9c907f]">Appearance editor</p>
            <h2 className="mt-3 font-display text-lg leading-relaxed text-white">{agent?.name ?? 'Agent'} customizer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pixel-button rounded-[10px] bg-[#1a140f] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f0d6a5] transition hover:brightness-110"
          >
            Cancel
          </button>
        </div>

        <div className="grid flex-1 min-h-0 gap-5 overflow-hidden px-6 py-4 lg:grid-cols-[260px_1fr]">
          {/* Live preview */}
          <div className="pixel-frame rounded-[14px] bg-[#131015] p-3 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#9c907f]">Live preview</div>
                <div className="mt-1 text-sm text-[#ddd4c8]">{PRESETS.find(p => p.id === selectedPreset)?.label}</div>
              </div>
              {isLoading ? <span className="text-xs text-[#9c907f]">Loading…</span> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {previewDirections.map((direction) => {
                const currentFrame = spriteSheet?.[direction]?.[frame];
                return (
                  <div key={direction} className="pixel-inset rounded-[12px] bg-black/20 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">{direction}</div>
                    <div className="pixel-inset flex aspect-square items-center justify-center rounded-[10px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_65%)]">
                      {currentFrame ? (
                        <img
                          src={currentFrame.toDataURL()}
                          alt={`${direction} sprite preview`}
                          className="h-16 w-16 object-contain [image-rendering:pixelated]"
                        />
                      ) : (
                        <div className="text-xs text-[#7f776c]">No preview</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preset selector */}
          <div className="flex min-h-0 flex-col">
            <div className="pixel-frame rounded-[14px] bg-[#131015] p-3 overflow-y-auto flex-1 min-h-0">
              <div className="mb-2 text-xs uppercase tracking-[0.22em] text-[#9c907f]">Character preset</div>
              <div className="grid gap-2">
                {PRESETS.map((preset) => {
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`pixel-frame flex items-center gap-3 rounded-[12px] px-3 py-2 text-left transition ${
                        isSelected
                          ? 'bg-[#d1a45a]/10'
                          : 'bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      {/* Mini preview */}
                      <div className="pixel-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-black/30">
                        {allPreviews[preset.id] ? (
                          <img
                            src={allPreviews[preset.id]!.toDataURL()}
                            alt={preset.label}
                            className={`h-9 w-9 object-contain [image-rendering:pixelated] ${!isSelected ? 'opacity-40 grayscale' : ''}`}
                          />
                        ) : (
                          <div className="text-xs text-[#7f776c]">{preset.label[0]}</div>
                        )}
                      </div>
                      <div>
                        <div className={`text-sm font-semibold ${isSelected ? 'text-[#f2dfba]' : 'text-[#ddd4c8]'}`}>
                          {preset.label}
                        </div>
                        <div className="text-xs text-[#9c907f]">{preset.description}</div>
                      </div>
                      {isSelected && (
                        <div className="ml-auto flex h-5 w-5 items-center justify-center bg-[#d1a45a]/20 text-[10px] text-[#d1a45a] pixel-inset">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Role Title & Reports To */}
            <div className="mt-3 flex flex-col gap-3 shrink-0">
              <div className="pixel-frame rounded-[12px] bg-[#131015] p-3">
                <label className="block text-[10px] uppercase tracking-[0.24em] text-[#9c907f] mb-1">Role title</label>
                <input
                  type="text"
                  value={roleDraft}
                  onChange={(e) => setRoleDraft(e.target.value)}
                  onBlur={handleRoleBlur}
                  className="w-full rounded border border-[#d1a45a]/40 bg-[#0f0e10] px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-[#d1a45a] transition"
                  placeholder="Agent"
                />
              </div>
              <div className="pixel-frame rounded-[12px] bg-[#131015] p-3">
                <label className="block text-[10px] uppercase tracking-[0.24em] text-[#9c907f] mb-1">Reports to</label>
                <select
                  value={parentDraft ?? ''}
                  onChange={handleParentChange}
                  className="w-full rounded border border-[#d1a45a]/40 bg-[#0f0e10] px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-[#d1a45a] transition"
                >
                  <option value="">None (Root Level)</option>
                  {agents
                    .filter((a) => agent && a.id !== agent.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName ?? a.name ?? a.id}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-3 border-t border-[#d1a45a]/15 pt-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="pixel-button rounded-[10px] bg-[#100d11] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-white transition hover:brightness-110"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="pixel-button rounded-[10px] bg-[#d1a45a]/15 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f2dfba] transition hover:brightness-110"
              >
                Save appearance
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
