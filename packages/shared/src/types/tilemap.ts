export interface Tilemap {
  version?: number;
  width: number;
  height: number;
  tileSize: number;
  layers: {
    floor: number[][];
    furniture: number[][];
    walls: number[][];
  };
  spawnPoints?: Array<{ x: number; y: number }>;
  walkable?: boolean[][];
}
