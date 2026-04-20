import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Reuse the JSONC comment stripper from config/index.ts
// Duplicated here to avoid circular imports
function stripJsoncComments(json: string): string {
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  while (i < json.length) {
    const ch = json[i];
    if (inString) {
      result += ch;
      if (ch === '\\') { i++; if (i < json.length) result += json[i]; }
      else if (ch === stringChar) inString = false;
    } else if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
    } else if (ch === '/' && json[i + 1] === '/') {
      while (i < json.length && json[i] !== '\n') i++;
      continue;
    } else if (ch === '/' && json[i + 1] === '*') {
      i += 2;
      while (i < json.length && !(json[i] === '*' && json[i + 1] === '/')) i++;
      i += 2;
      continue;
    } else {
      result += ch;
    }
    i++;
  }
  return result;
}

export interface HierarchyEdge {
  parent: string;
  child: string;
}

export interface SpawnPosition {
  x: number;
  y: number;
}

export interface PixdashConfigSchema {
  displayNames: Record<string, string>;
  roles: Record<string, string>;
  hierarchy: HierarchyEdge[];
  reservedWaypoints: Record<string, string>;
  spawnPositions: SpawnPosition[];
}

const DEFAULT_SPAWN_POSITIONS: SpawnPosition[] = [
  { x: 3, y: 22 },
  { x: 6, y: 22 },
  { x: 16, y: 22 },
  { x: 20, y: 21 },
  { x: 23, y: 22 },
  { x: 31, y: 22 },
  { x: 35, y: 22 },
  { x: 48, y: 22 },
  { x: 52, y: 22 },
  { x: 57, y: 22 },
  { x: 69, y: 22 },
  { x: 72, y: 22 },
  { x: 3, y: 21 },
  { x: 18, y: 21 },
  { x: 32, y: 21 },
  { x: 38, y: 21 },
];

const DEFAULT_CONFIG: PixdashConfigSchema = {
  displayNames: {
    main: 'Clawdie',
    devo: 'Devo',
    cornelio: 'Cornelio',
    docclaw: 'DocClaw',
    infralover: 'InfraLover',
    forbidden: 'Forbidden',
  },
  roles: {
    main: 'CEO',
    devo: 'CDO',
    cornelio: 'CISO',
    infralover: 'IM',
    docclaw: 'DM',
    forbidden: 'Analyst',
  },
  hierarchy: [
    { parent: 'main', child: 'devo' },
    { parent: 'main', child: 'cornelio' },
    { parent: 'devo', child: 'infralover' },
    { parent: 'devo', child: 'docclaw' },
    { parent: 'infralover', child: 'forbidden' },
  ],
  reservedWaypoints: {},
  spawnPositions: [...DEFAULT_SPAWN_POSITIONS],
};

class PixdashConfig {
  private config: PixdashConfigSchema = { ...DEFAULT_CONFIG };

  constructor() {
    this.load();
  }

  private load(): void {
    // Walk up from packages/backend to find project root with pixdash.json
    let configPath = path.resolve(process.cwd(), 'pixdash.json');
    if (!existsSync(configPath)) {
      configPath = path.resolve(process.cwd(), '..', '..', 'pixdash.json');
    }
    // Also check PIXDASH_CONFIG_PATH env override
    if (process.env.PIXDASH_CONFIG_PATH) {
      configPath = path.resolve(process.env.PIXDASH_CONFIG_PATH);
    }
    if (!existsSync(configPath)) {
      this.config = { ...DEFAULT_CONFIG };
      return;
    }
    try {
      const raw = readFileSync(configPath, 'utf8');
      const stripped = stripJsoncComments(raw);
      const parsed = JSON.parse(stripped) as Partial<PixdashConfigSchema>;
      this.config = {
        displayNames: parsed.displayNames ?? { ...DEFAULT_CONFIG.displayNames },
        roles: parsed.roles ?? { ...DEFAULT_CONFIG.roles },
        hierarchy: parsed.hierarchy ?? [...DEFAULT_CONFIG.hierarchy],
        reservedWaypoints: parsed.reservedWaypoints ?? { ...DEFAULT_CONFIG.reservedWaypoints },
        spawnPositions: Array.isArray(parsed.spawnPositions) && parsed.spawnPositions.length > 0
          ? parsed.spawnPositions as SpawnPosition[]
          : [...DEFAULT_SPAWN_POSITIONS],
      };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  reload(): void {
    this.load();
  }

  getDisplayName(agentId: string, _fallbackName: string): string | undefined {
    return this.config.displayNames[agentId];
  }

  getDisplayNameOrFallback(agentId: string, fallbackName: string): string {
    return this.config.displayNames[agentId] ?? fallbackName;
  }

  getRole(agentId: string): string {
    return this.config.roles[agentId] ?? 'Agent';
  }

  getHierarchy(): HierarchyEdge[] {
    return this.config.hierarchy;
  }

  getReservedWaypoint(agentId: string): string | null {
    return this.config.reservedWaypoints[agentId] ?? null;
  }

  getSpawnPositions(): SpawnPosition[] {
    return this.config.spawnPositions;
  }

  /** Public-facing config (no reservedWaypoints) */
  getPublicConfig(): { displayNames: Record<string, string>; roles: Record<string, string>; hierarchy: HierarchyEdge[] } {
    return {
      displayNames: { ...this.config.displayNames },
      roles: { ...this.config.roles },
      hierarchy: [...this.config.hierarchy],
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Mutation methods (in-memory + persist to pixdash.json)            */
  /* ------------------------------------------------------------------ */

  private getConfigPath(): string {
    let configPath = path.resolve(process.cwd(), 'pixdash.json');
    if (!existsSync(configPath)) {
      configPath = path.resolve(process.cwd(), '..', '..', 'pixdash.json');
    }
    if (process.env.PIXDASH_CONFIG_PATH) {
      configPath = path.resolve(process.env.PIXDASH_CONFIG_PATH);
    }
    return configPath;
  }

  private saveToFile(): void {
    const configPath = this.getConfigPath();
    // Ensure the directory exists
    const dir = path.dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(this.config, null, 2);
    writeFileSync(configPath, `// PixDash configuration – auto-generated\n${json}\n`, 'utf8');
  }

  updateDisplayName(agentId: string, displayName: string): { displayNames: Record<string, string> } {
    if (displayName.trim() === '') {
      delete this.config.displayNames[agentId];
    } else {
      this.config.displayNames[agentId] = displayName.trim();
    }
    this.saveToFile();
    return { displayNames: { ...this.config.displayNames } };
  }

  updateRole(agentId: string, role: string): { roles: Record<string, string> } {
    if (role.trim() === '') {
      delete this.config.roles[agentId];
    } else {
      this.config.roles[agentId] = role.trim();
    }
    this.saveToFile();
    return { roles: { ...this.config.roles } };
  }

  /**
   * Reassign a child's parent in the hierarchy.
   * Returns the updated hierarchy or throws on validation failure.
   */
  updateHierarchy(child: string, newParent: string | null): { hierarchy: HierarchyEdge[] } {
    // Prevent self-parenting
    if (newParent === child) {
      throw new Error('An agent cannot be its own parent.');
    }

    // Remove any existing edge where this child appears
    this.config.hierarchy = this.config.hierarchy.filter((e) => e.child !== child);

    if (newParent !== null) {
      // Check for circular dependency: newParent must not be a descendant of child
      if (this.wouldCreateCycle(child, newParent)) {
        throw new Error('Circular dependency detected.');
      }
      this.config.hierarchy.push({ parent: newParent, child });
    }

    this.saveToFile();
    return { hierarchy: [...this.config.hierarchy] };
  }

  /** BFS from `start` to see if we can reach `target` following parent→child edges */
  private wouldCreateCycle(start: string, target: string): boolean {
    const childrenOf = new Map<string, string[]>();
    for (const edge of this.config.hierarchy) {
      const list = childrenOf.get(edge.parent) ?? [];
      list.push(edge.child);
      childrenOf.set(edge.parent, list);
    }
    // After hypothetical addition: child→newParent edge
    // Cycle exists if from `target` we can reach `start` via child edges
    const visited = new Set<string>();
    const queue = [target];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === start) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const kids = childrenOf.get(current);
      if (kids) {
        for (const kid of kids) {
          if (!visited.has(kid)) queue.push(kid);
        }
      }
    }
    return false;
  }

  resetToDefaults(): { displayNames: Record<string, string>; roles: Record<string, string>; hierarchy: HierarchyEdge[] } {
    // Preserve reservedWaypoints and spawnPositions from current config
    const reserved = { ...this.config.reservedWaypoints };
    const spawns = [...this.config.spawnPositions];

    this.config = {
      ...DEFAULT_CONFIG,
      reservedWaypoints: reserved,
      spawnPositions: spawns,
    };
    this.saveToFile();
    return this.getPublicConfig();
  }
}

export const pixdashConfig = new PixdashConfig();
