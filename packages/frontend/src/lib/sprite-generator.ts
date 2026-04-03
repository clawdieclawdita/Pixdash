import type {
  Accessory,
  Appearance,
  BodyType,
  Direction,
  HairStyle
} from '@pixdash/shared';

export type {
  Accessory,
  AccessoryType,
  Appearance,
  BodyType,
  Direction,
  HairStyle,
  OutfitType
} from '@pixdash/shared';

export type SpriteSheet = Record<Direction, ImageData[]>;

const SIZE = 16;
const DIRECTIONS: Direction[] = ['south', 'north', 'east', 'west'];
const TRANSPARENT = '#00000000';

const DEFAULT_APPEARANCE: Appearance = {
  bodyType: 'neutral',
  hair: { style: 'short', color: '#2C1810' },
  skinColor: '#E8BEAC',
  outfit: { type: 'casual', color: '#3B5998' },
  accessories: []
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeHex = (hex: string) => {
  const value = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.toUpperCase();
  return '#000000';
};

const hexToRgba = (hex: string): [number, number, number, number] => {
  const normalized = normalizeHex(hex);
  if (normalized.length === 9) {
    return [
      Number.parseInt(normalized.slice(1, 3), 16),
      Number.parseInt(normalized.slice(3, 5), 16),
      Number.parseInt(normalized.slice(5, 7), 16),
      Number.parseInt(normalized.slice(7, 9), 16)
    ];
  }

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
    255
  ];
};

const adjustColor = (hex: string, amount: number) => {
  const [r, g, b, a] = hexToRgba(hex);
  const shift = (channel: number) => clamp(channel + amount, 0, 255);
  const toHex = (channel: number) => shift(channel).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${a === 255 ? '' : a.toString(16).padStart(2, '0').toUpperCase()}`;
};

const createPixelGrid = () => Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => TRANSPARENT));

type PixelGrid = ReturnType<typeof createPixelGrid>;

const setPixel = (grid: PixelGrid, x: number, y: number, color: string) => {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  grid[y][x] = color;
};

const fillRect = (grid: PixelGrid, x: number, y: number, width: number, height: number, color: string) => {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      setPixel(grid, col, row, color);
    }
  }
};

const applyPoints = (grid: PixelGrid, points: Array<[number, number]>, color: string, dx = 0, dy = 0) => {
  points.forEach(([x, y]) => setPixel(grid, x + dx, y + dy, color));
};

const bodySilhouette = (bodyType: BodyType, direction: Direction) => {
  const shoulders = bodyType === 'male' ? [4, 11] : bodyType === 'female' ? [5, 10] : [4, 10];
  const waist = bodyType === 'male' ? [5, 10] : bodyType === 'female' ? [6, 9] : [5, 9];
  const frontFacing = direction === 'south' || direction === 'north';

  return {
    head: { x: 5, y: 1, width: 6, height: 5 },
    torso: {
      x: frontFacing ? shoulders[0] : shoulders[0] + 1,
      y: 6,
      width: frontFacing ? shoulders[1] - shoulders[0] + 1 : waist[1] - waist[0] + 1,
      height: 5
    },
    hips: { x: waist[0], y: 10, width: waist[1] - waist[0] + 1, height: 2 }
  };
};

const footOffsetsByFrame = (frame: number) => {
  const cycle = frame % 4;
  if (cycle === 0) return { left: 1, right: 0 };
  if (cycle === 1) return { left: 0, right: 0 };
  if (cycle === 2) return { left: 0, right: 1 };
  return { left: 0, right: 0 };
};

const breatheOffsetByFrame = (frame: number) => {
  const cycle = frame % 4;
  if (cycle === 1) return -1;
  if (cycle === 3) return 1;
  return 0;
};

const drawBody = (grid: PixelGrid, appearance: Appearance, direction: Direction, frame: number) => {
  const silhouette = bodySilhouette(appearance.bodyType, direction);
  const skin = appearance.skinColor;
  const skinShade = adjustColor(skin, -18);
  const verticalOffset = breatheOffsetByFrame(frame);
  const isSide = direction === 'east' || direction === 'west';

  fillRect(grid, silhouette.head.x, silhouette.head.y + verticalOffset, silhouette.head.width, silhouette.head.height, skin);
  fillRect(grid, silhouette.torso.x, silhouette.torso.y + verticalOffset, silhouette.torso.width, silhouette.torso.height, skin);
  fillRect(grid, silhouette.hips.x, silhouette.hips.y + verticalOffset, silhouette.hips.width, silhouette.hips.height, skinShade);

  if (!isSide) {
    setPixel(grid, 7, 3 + verticalOffset, '#2B1B14');
    setPixel(grid, 8, 3 + verticalOffset, '#2B1B14');
  } else {
    setPixel(grid, direction === 'east' ? 9 : 6, 3 + verticalOffset, '#2B1B14');
  }

  const footOffsets = footOffsetsByFrame(frame);
  const legX = isSide ? [6, 8] : [6, 9];
  fillRect(grid, legX[0], 12 + footOffsets.left + verticalOffset, 2, 3, skinShade);
  fillRect(grid, legX[1], 12 + footOffsets.right + verticalOffset, 2, 3, skinShade);

  if (direction === 'east') {
    fillRect(grid, 10, 7 + verticalOffset, 1, 4, skinShade);
  } else if (direction === 'west') {
    fillRect(grid, 5, 7 + verticalOffset, 1, 4, skinShade);
  } else {
    fillRect(grid, 3, 7 + verticalOffset, 1, 4, skinShade);
    fillRect(grid, 12, 7 + verticalOffset, 1, 4, skinShade);
  }
};

const drawOutfit = (grid: PixelGrid, appearance: Appearance, direction: Direction, frame: number) => {
  const base = appearance.outfit.color;
  const shade = adjustColor(base, -24);
  const highlight = adjustColor(base, 20);
  const y = breatheOffsetByFrame(frame);

  switch (appearance.outfit.type) {
    case 'casual':
      fillRect(grid, 5, 7 + y, 6, 4, base);
      fillRect(grid, 5, 11 + y, 6, 2, shade);
      break;
    case 'formal':
      fillRect(grid, 5, 7 + y, 6, 5, base);
      applyPoints(grid, [[7, 8], [8, 8], [7, 9], [8, 9], [7, 10], [8, 10]], '#F4F1EA', 0, y);
      fillRect(grid, 7, 8 + y, 2, 4, shade);
      break;
    case 'hoodie':
      fillRect(grid, 4, 7 + y, 8, 5, base);
      fillRect(grid, 5, 6 + y, 6, 2, shade);
      fillRect(grid, 6, 10 + y, 4, 2, highlight);
      break;
    case 'tank-top':
      fillRect(grid, 6, 7 + y, 4, 4, base);
      fillRect(grid, 6, 11 + y, 4, 2, shade);
      break;
  }

  if (direction === 'east') {
    fillRect(grid, 10, 7 + y, 1, 4, shade);
  } else if (direction === 'west') {
    fillRect(grid, 5, 7 + y, 1, 4, shade);
  }
};

const hairPatterns: Record<HairStyle, Array<[number, number]>> = {
  short: [
    [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
    [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3]
  ],
  long: [
    [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
    [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2],
    [4, 3], [5, 3], [9, 3], [10, 3],
    [4, 4], [5, 4], [9, 4], [10, 4],
    [4, 5], [5, 5], [9, 5], [10, 5]
  ],
  bald: [],
  ponytail: [
    [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
    [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3],
    [7, 4], [7, 5], [7, 6]
  ],
  spiky: [
    [5, 1], [7, 0], [9, 1],
    [4, 2], [5, 2], [6, 1], [7, 2], [8, 1], [9, 2], [10, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3]
  ]
};

const drawHair = (grid: PixelGrid, appearance: Appearance, direction: Direction, frame: number) => {
  if (appearance.hair.style === 'bald') return;

  const color = appearance.hair.color;
  const shade = adjustColor(color, -24);
  const y = breatheOffsetByFrame(frame);
  let pattern = hairPatterns[appearance.hair.style];

  if (direction === 'north') {
    pattern = pattern.map(([x, py]) => [x, py + (appearance.hair.style === 'long' ? 1 : 0)]);
  }

  if (direction === 'east') {
    pattern = pattern.map(([x, py]) => [Math.max(x, 6), py]);
  } else if (direction === 'west') {
    pattern = pattern.map(([x, py]) => [Math.min(x, 9), py]);
  }

  applyPoints(grid, pattern, color, 0, y);

  if (appearance.hair.style === 'ponytail') {
    const tailX = direction === 'east' ? 5 : direction === 'west' ? 10 : 7;
    applyPoints(grid, [[tailX, 4], [tailX, 5], [tailX, 6]], shade, 0, y);
  }
};

const drawAccessory = (grid: PixelGrid, accessory: Accessory, direction: Direction, frame: number) => {
  const color = accessory.color ?? '#C7CCD5';
  const y = breatheOffsetByFrame(frame);

  switch (accessory.type) {
    case 'glasses':
      applyPoints(grid, [[5, 3], [6, 3], [8, 3], [9, 3], [7, 3]], color, 0, y);
      break;
    case 'hat':
      fillRect(grid, 4, 0 + y, 8, 2, color);
      fillRect(grid, 3, 2 + y, 10, 1, adjustColor(color, -18));
      break;
    case 'headphones':
      applyPoints(grid, [[4, 2], [4, 3], [10, 2], [10, 3], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1]], color, 0, y);
      break;
    case 'watch':
      if (direction === 'east') {
        fillRect(grid, 10, 10 + y, 1, 2, color);
      } else {
        fillRect(grid, 4, 10 + y, 1, 2, color);
      }
      break;
  }
};

const gridToImageData = (grid: PixelGrid) => {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b, a] = grid[y][x] === TRANSPARENT ? [0, 0, 0, 0] : hexToRgba(grid[y][x]);
      const index = (y * SIZE + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }

  return new ImageData(data, SIZE, SIZE);
};

const normalizeAppearance = (appearance: Appearance): Appearance => ({
  bodyType: appearance.bodyType,
  hair: {
    style: appearance.hair.style,
    color: normalizeHex(appearance.hair.color)
  },
  skinColor: normalizeHex(appearance.skinColor),
  outfit: {
    type: appearance.outfit.type,
    color: normalizeHex(appearance.outfit.color)
  },
  accessories: [...(appearance.accessories ?? [])]
    .map((accessory) => ({
      type: accessory.type,
      color: accessory.color ? normalizeHex(accessory.color) : undefined
    }))
    .sort((left, right) => left.type.localeCompare(right.type))
});

export const hashAppearance = (appearance: Appearance) => JSON.stringify(normalizeAppearance(appearance));

export const generateSprite = (
  appearance: Appearance = DEFAULT_APPEARANCE,
  direction: Direction,
  frame: number
): ImageData => {
  const normalized = normalizeAppearance(appearance);
  const grid = createPixelGrid();

  drawBody(grid, normalized, direction, frame);
  drawOutfit(grid, normalized, direction, frame);
  drawHair(grid, normalized, direction, frame);
  normalized.accessories?.forEach((accessory) => drawAccessory(grid, accessory, direction, frame));

  return gridToImageData(grid);
};

export const generateSpriteSheet = (appearance: Appearance = DEFAULT_APPEARANCE): SpriteSheet => {
  const sheet = {} as SpriteSheet;

  DIRECTIONS.forEach((direction) => {
    sheet[direction] = Array.from({ length: 4 }, (_, frame) => generateSprite(appearance, direction, frame));
  });

  return sheet;
};

export const DEFAULT_SPRITE_APPEARANCE = DEFAULT_APPEARANCE;
export const SPRITE_DIRECTIONS = DIRECTIONS;
