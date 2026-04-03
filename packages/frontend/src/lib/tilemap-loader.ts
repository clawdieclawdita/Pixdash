import officeLayout from '../../../../assets/office-layout.json';
import type { TilemapData } from '@/types';

const ensureRectangular = (grid: number[][], width: number, height: number, label: string) => {
  if (grid.length !== height) {
    throw new Error(`${label} layer height ${grid.length}; expected ${height}.`);
  }

  grid.forEach((row, rowIndex) => {
    if (row.length !== width) {
      throw new Error(`${label} layer row ${rowIndex} has width ${row.length}; expected ${width}.`);
    }
  });
};

const ensureWalkableRectangular = (grid: boolean[][], width: number, height: number) => {
  if (grid.length !== height) {
    throw new Error(`walkable grid height ${grid.length}; expected ${height}.`);
  }

  grid.forEach((row, rowIndex) => {
    if (row.length !== width) {
      throw new Error(`walkable row ${rowIndex} has width ${row.length}; expected ${width}.`);
    }
  });
};

export const loadDefaultTilemap = (): TilemapData => {
  const tilemap = officeLayout as TilemapData;
  const { width, height, layers, walkable } = tilemap;

  ensureRectangular(layers.floor, width, height, 'floor');
  ensureRectangular(layers.furniture, width, height, 'furniture');
  ensureRectangular(layers.walls, width, height, 'walls');
  ensureWalkableRectangular(walkable, width, height);

  return tilemap;
};
