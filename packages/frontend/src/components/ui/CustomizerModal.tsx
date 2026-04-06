import { useEffect, useMemo, useState } from 'react';
import { useSprites } from '@/hooks/useSprites';
import {
  DEFAULT_SPRITE_APPEARANCE,
  type Appearance,
  type Direction
} from '@/lib/sprite-generator';
import type { AgentProfile } from '@/types';
import { type SpriteTemplate, clearSpriteTemplateCache } from '@/lib/spriteSheets';

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
  bodyType: 'male' | 'female';
  description: string;
};

const PRESETS: CharacterPreset[] = [
  {
    id: 'michael',
    label: 'Michael',
    bodyType: 'male',
    description: 'Male character template'
  },
  {
    id: 'angela',
    label: 'Angela',
    bodyType: 'female',
    description: 'Female character template'
  }
];

const previewDirections: Direction[] = ['south', 'north', 'east', 'west'];

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
    baseAppearance.bodyType === 'female' ? 'angela' : 'michael'
  );
  const { spriteSheet, isLoading } = useSprites(draft);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const preset = baseAppearance.bodyType === 'female' ? 'angela' : 'michael';
    setSelectedPreset(preset);
    setDraft(baseAppearance);
  }, [baseAppearance, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % 3);
    }, 350);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePresetSelect = (preset: CharacterPreset) => {
    setSelectedPreset(preset.id);
    setDraft((current) => ({
      ...current,
      bodyType: preset.bodyType
    }));
    clearSpriteTemplateCache();
  };

  const handleSave = () => {
    if (onSave) {
      onSave(draft);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0f1014] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#9c907f]">Appearance editor</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{agent?.name ?? 'Agent'} customizer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
          >
            Cancel
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[240px_1fr]">
          {/* Live preview */}
          <div className="rounded-2xl border border-white/10 bg-[#13151b] p-4">
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
                  <div key={direction} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">{direction}</div>
                    <div className="flex aspect-square items-center justify-center rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_65%)]">
                      {currentFrame ? (
                        <img
                          src={currentFrame.toDataURL()}
                          alt={`${direction} sprite preview`}
                          className="h-24 w-24 object-contain [image-rendering:pixelated]"
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
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#13151b] p-4">
              <div className="mb-4 text-xs uppercase tracking-[0.22em] text-[#9c907f]">Character preset</div>
              <div className="grid gap-3">
                {PRESETS.map((preset) => {
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-[#d1a45a]/50 bg-[#d1a45a]/10'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      {/* Mini preview */}
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/30">
                        <img
                          src={spriteSheet?.south?.[0]?.toDataURL() ?? ''}
                          alt={preset.label}
                          className={`h-14 w-14 object-contain [image-rendering:pixelated] ${!isSelected ? 'opacity-40 grayscale' : ''}`}
                          style={{ visibility: isSelected && spriteSheet?.south?.[0] ? 'visible' : 'hidden' }}
                        />
                        {!isSelected && (
                          <div className="absolute text-lg text-[#7f776c]">{preset.label[0]}</div>
                        )}
                      </div>
                      <div>
                        <div className={`text-sm font-semibold ${isSelected ? 'text-[#f2dfba]' : 'text-[#ddd4c8]'}`}>
                          {preset.label}
                        </div>
                        <div className="text-xs text-[#9c907f]">{preset.description}</div>
                      </div>
                      {isSelected && (
                        <div className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#d1a45a]/20 text-[10px] text-[#d1a45a]">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl border border-[#d1a45a]/35 bg-[#d1a45a]/15 px-4 py-2 text-sm font-medium text-[#f2dfba] transition hover:bg-[#d1a45a]/20"
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
