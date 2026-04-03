import { useEffect, useMemo, useState } from 'react';
import { useSprites } from '@/hooks/useSprites';
import {
  DEFAULT_SPRITE_APPEARANCE,
  type Accessory,
  type AccessoryType,
  type Appearance,
  type BodyType,
  type Direction,
  type HairStyle
} from '@/lib/sprite-generator';
import type { AgentProfile } from '@/types';

interface LegacyCustomizerModalProps {
  agent: AgentProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (appearance: Appearance) => void;
  initialAppearance?: Appearance;
}

const bodyTypes: BodyType[] = ['male', 'female', 'neutral'];
const hairStyles: HairStyle[] = ['short', 'long', 'bald', 'ponytail', 'spiky'];
const accessoryTypes: AccessoryType[] = ['glasses', 'hat', 'headphones', 'watch'];
const previewDirections: Direction[] = ['south', 'north', 'east', 'west'];

const fallbackAppearanceFromAgent = (agent: AgentProfile | null): Appearance => ({
  ...DEFAULT_SPRITE_APPEARANCE,
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
  accessories: [...(appearance.accessories ?? [])].map((accessory) => ({ ...accessory }))
});

const upsertAccessory = (accessories: Accessory[], type: AccessoryType, enabled: boolean): Accessory[] => {
  const without = accessories.filter((accessory) => accessory.type !== type);
  if (!enabled) return without;
  return [...without, { type }];
};

const imageDataToDataUrl = (imageData: ImageData | undefined) => {
  if (!imageData || typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
};

export const CustomizerModal = ({
  agent,
  isOpen,
  onClose,
  onSave,
  initialAppearance
}: LegacyCustomizerModalProps) => {
  const baseAppearance = useMemo(
    () => cloneAppearance(initialAppearance ?? fallbackAppearanceFromAgent(agent)),
    [agent, initialAppearance]
  );

  const [draft, setDraft] = useState<Appearance>(baseAppearance);
  const { spriteSheet, isLoading } = useSprites(draft);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(baseAppearance);
  }, [baseAppearance, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % 4);
    }, 220);

    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (onSave) {
      onSave(draft);
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0f1014] shadow-2xl shadow-black/60">
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

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[260px_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#13151b] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#9c907f]">Live preview</div>
                <div className="mt-1 text-sm text-[#ddd4c8]">16×16 procedural sprite</div>
              </div>
              {isLoading ? <span className="text-xs text-[#9c907f]">Rendering…</span> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {previewDirections.map((direction) => {
                const currentFrame = spriteSheet?.[direction]?.[frame];
                const previewUrl = imageDataToDataUrl(currentFrame);

                return (
                  <div key={direction} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">{direction}</div>
                    <div className="flex aspect-square items-center justify-center rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_65%)]">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
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

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-[#9c907f]">Body type</span>
                <select
                  value={draft.bodyType}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      bodyType: event.target.value as BodyType
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#171a21] px-3 py-2 text-sm text-white outline-none transition focus:border-[#d1a45a]/50"
                >
                  {bodyTypes.map((bodyType) => (
                    <option key={bodyType} value={bodyType}>
                      {bodyType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-[#9c907f]">Hair style</span>
                <select
                  value={draft.hair.style}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      hair: {
                        ...current.hair,
                        style: event.target.value as HairStyle
                      }
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#171a21] px-3 py-2 text-sm text-white outline-none transition focus:border-[#d1a45a]/50"
                >
                  {hairStyles.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-[#9c907f]">Skin</span>
                <input
                  type="color"
                  value={draft.skinColor}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      skinColor: event.target.value
                    }))
                  }
                  className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-[#171a21] p-1"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-[#9c907f]">Hair</span>
                <input
                  type="color"
                  value={draft.hair.color}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      hair: {
                        ...current.hair,
                        color: event.target.value
                      }
                    }))
                  }
                  className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-[#171a21] p-1"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-[#9c907f]">Outfit</span>
                <input
                  type="color"
                  value={draft.outfit.color}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      outfit: {
                        ...current.outfit,
                        color: event.target.value
                      }
                    }))
                  }
                  className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-[#171a21] p-1"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#13151b] p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-[#9c907f]">Accessories</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {accessoryTypes.map((accessoryType) => {
                  const checked = (draft.accessories ?? []).some((accessory) => accessory.type === accessoryType);

                  return (
                    <label
                      key={accessoryType}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[#ddd4c8]"
                    >
                      <span>{accessoryType}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            accessories: upsertAccessory(current.accessories ?? [], accessoryType, event.target.checked)
                          }))
                        }
                        className="h-4 w-4 rounded border-white/20 bg-[#171a21]"
                      />
                    </label>
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
