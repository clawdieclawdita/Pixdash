import { useEffect, useMemo, useState } from 'react';
import {
  generateSpriteSheet,
  hashAppearance,
  type Appearance,
  type SpriteSheet
} from '@/lib/sprite-generator';

const spriteCache = new Map<string, SpriteSheet>();

export const useSprites = (appearance: Appearance) => {
  const cacheKey = useMemo(() => hashAppearance(appearance), [appearance]);
  const [spriteSheet, setSpriteSheet] = useState<SpriteSheet | null>(() => spriteCache.get(cacheKey) ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !spriteCache.has(cacheKey));

  useEffect(() => {
    const cached = spriteCache.get(cacheKey);
    if (cached) {
      setSpriteSheet(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const generated = generateSpriteSheet(appearance);
    spriteCache.set(cacheKey, generated);
    setSpriteSheet(generated);
    setIsLoading(false);
  }, [appearance, cacheKey]);

  return { spriteSheet, isLoading };
};

export const clearSpriteCache = () => {
  spriteCache.clear();
};
