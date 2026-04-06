import { useEffect, useMemo, useState } from 'react';
import type { Appearance } from '@pixdash/shared';
import {
  clearSpriteTemplateCache,
  loadSpriteTemplate,
  pickSpriteTemplateFromAppearance,
  type SpriteSheetFrames
} from '@/lib/spriteSheets';

const spriteCache = new Map<string, SpriteSheetFrames>();

export const useSprites = (appearance: Appearance) => {
  const cacheKey = useMemo(() => pickSpriteTemplateFromAppearance(appearance), [appearance]);
  const [spriteSheet, setSpriteSheet] = useState<SpriteSheetFrames | null>(() => spriteCache.get(cacheKey) ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !spriteCache.has(cacheKey));

  useEffect(() => {
    let mounted = true;
    const cached = spriteCache.get(cacheKey);

    if (cached) {
      setSpriteSheet(cached);
      setIsLoading(false);
      return () => {
        mounted = false;
      };
    }

    setIsLoading(true);

    void loadSpriteTemplate(cacheKey)
      .then((sheet) => {
        if (!mounted) return;
        spriteCache.set(cacheKey, sheet);
        setSpriteSheet(sheet);
        setIsLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSpriteSheet(null);
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [cacheKey]);

  return { spriteSheet, isLoading };
};

export const clearSpriteCache = () => {
  spriteCache.clear();
  clearSpriteTemplateCache();
};
