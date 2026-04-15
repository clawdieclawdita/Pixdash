import type { Appearance, Direction } from '@pixdash/shared';
import { hashAppearance } from '@/lib/sprite-generator';
import michaelSpriteUrl from '@assets/sprites/michael.png';
import angelaSpriteUrl from '@assets/sprites/angela.png';
import phillisSpriteUrl from '@assets/sprites/phillis.png';
import creedSpriteUrl from '@assets/sprites/creed.png';
import ryanSpriteUrl from '@assets/sprites/ryan.png';
import pamSpriteUrl from '@assets/sprites/pam.png';
import kellySpriteUrl from '@assets/sprites/kelly.png';
import kateSpriteUrl from '@assets/sprites/kate.png';
import pitesSpriteUrl from '@assets/sprites/pites.png';
import jimSpriteUrl from '@assets/sprites/jim.png';
import clawdieSpriteUrl from '@assets/sprites/clawdie.png';

export type SpriteTemplate =
  | 'michael'
  | 'angela'
  | 'phillis'
  | 'creed'
  | 'ryan'
  | 'pam'
  | 'kelly'
  | 'kate'
  | 'pites'
  | 'jim'
  | 'clawdie';
export type SpriteFrameCanvas = HTMLCanvasElement;
export type SpriteSheetFrames = Record<Direction, SpriteFrameCanvas[]>;

const SHEET_WIDTH = 2048;
const SHEET_HEIGHT = 2048;
const SHEET_COLUMNS = 3;
const SHEET_ROWS = 4;
const FRAME_WIDTH = Math.floor(SHEET_WIDTH / SHEET_COLUMNS);
const FRAME_HEIGHT = Math.floor(SHEET_HEIGHT / SHEET_ROWS);

const DIRECTION_BY_ROW: Direction[] = ['south', 'north', 'west', 'east'];

const sheetPromiseCache = new Map<SpriteTemplate, Promise<SpriteSheetFrames>>();

const SPRITE_TEMPLATES: SpriteTemplate[] = [
  'michael',
  'angela',
  'phillis',
  'creed',
  'ryan',
  'pam',
  'kelly',
  'kate',
  'pites',
  'jim',
  'clawdie'
];

const SPRITE_SOURCES: Record<SpriteTemplate, string> = {
  michael: michaelSpriteUrl,
  angela: angelaSpriteUrl,
  phillis: phillisSpriteUrl,
  creed: creedSpriteUrl,
  ryan: ryanSpriteUrl,
  pam: pamSpriteUrl,
  kelly: kellySpriteUrl,
  kate: kateSpriteUrl,
  pites: pitesSpriteUrl,
  jim: jimSpriteUrl,
  clawdie: clawdieSpriteUrl
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load sprite sheet: ${src}`));
    image.src = src;
  });

const centerAlignFrame = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = source.getContext('2d');
  if (!ctx) return source;

  const imageData = ctx.getImageData(0, 0, source.width, source.height);
  const { data, width, height } = imageData;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hasContent = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        hasContent = true;
      }
    }
  }

  if (!hasContent) return source;

  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;
  const contentCenterX = minX + contentW / 2;
  const contentCenterY = minY + contentH / 2;
  const cellCenterX = width / 2;
  const cellCenterY = height / 2;
  const shiftX = cellCenterX - contentCenterX;
  const shiftY = cellCenterY - contentCenterY;

  const centered = document.createElement('canvas');
  centered.width = width;
  centered.height = height;
  const centeredCtx = centered.getContext('2d');
  if (!centeredCtx) return source;

  centeredCtx.imageSmoothingEnabled = false;
  centeredCtx.drawImage(source, shiftX, shiftY);
  return centered;
};

const extractSheetFrames = async (src: string): Promise<SpriteSheetFrames> => {
  const image = await loadImage(src);
  const frames = {
    south: [],
    north: [],
    east: [],
    west: []
  } as SpriteSheetFrames;

  for (let row = 0; row < SHEET_ROWS; row += 1) {
    const direction = DIRECTION_BY_ROW[row];

    for (let col = 0; col < SHEET_COLUMNS; col += 1) {
      const raw = document.createElement('canvas');
      raw.width = FRAME_WIDTH;
      raw.height = FRAME_HEIGHT;
      const context = raw.getContext('2d');

      if (!context) {
        throw new Error('Unable to create sprite frame canvas context.');
      }

      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        col * FRAME_WIDTH,
        row * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT
      );

      frames[direction].push(centerAlignFrame(raw));
    }
  }

  return frames;
};

export const loadSpriteTemplate = (template: SpriteTemplate): Promise<SpriteSheetFrames> => {
  const cached = sheetPromiseCache.get(template);
  if (cached) return cached;

  const promise = extractSheetFrames(SPRITE_SOURCES[template]);
  sheetPromiseCache.set(template, promise);
  return promise;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const pickSpriteTemplateFromAppearance = (appearance: Appearance): SpriteTemplate => {
  const bodyTypeTemplateMap: Partial<Record<string, SpriteTemplate>> = {
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

  const mappedTemplate = bodyTypeTemplateMap[appearance.bodyType];
  if (mappedTemplate) return mappedTemplate;

  return SPRITE_TEMPLATES[hashString(hashAppearance(appearance)) % SPRITE_TEMPLATES.length];
};

export const clearSpriteTemplateCache = () => {
  sheetPromiseCache.clear();
};
