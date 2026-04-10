import { useEffect, useState } from 'react';
import {
  loadSpriteTemplate,
  type SpriteTemplate,
  type SpriteSheetFrames
} from '@/lib/spriteSheets';

const ALL_TEMPLATES: SpriteTemplate[] = [
  'michael', 'angela', 'phillis', 'creed', 'ryan',
  'pam', 'kelly', 'kate', 'pites', 'jim', 'clawdie'
];

export type SpritePreviews = Partial<Record<SpriteTemplate, HTMLCanvasElement>>;

/**
 * Preloads the south-facing idle frame for every sprite template
 * so preset cards can show thumbnails without being selected first.
 */
export const useAllSpritePreviews = (): SpritePreviews => {
  const [previews, setPreviews] = useState<SpritePreviews>({});

  useEffect(() => {
    let mounted = true;

    void Promise.allSettled(
      ALL_TEMPLATES.map(async (template) => {
        try {
          const frames: SpriteSheetFrames = await loadSpriteTemplate(template);
          const frame = frames.south?.[0];
          if (frame && mounted) {
            setPreviews((prev) => ({ ...prev, [template]: frame }));
          }
        } catch {
          // skip failed loads
        }
      })
    );

    return () => {
      mounted = false;
    };
  }, []);

  return previews;
};
