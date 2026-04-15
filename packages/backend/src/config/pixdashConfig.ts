import { existsSync, readFileSync } from 'node:fs';
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

export interface PixdashConfigSchema {
  displayNames: Record<string, string>;
  roles: Record<string, string>;
  hierarchy: HierarchyEdge[];
  reservedWaypoints: Record<string, string>;
}

const DEFAULT_CONFIG: PixdashConfigSchema = {
  displayNames: {},
  roles: {},
  hierarchy: [],
  reservedWaypoints: {},
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

  /** Public-facing config (no reservedWaypoints) */
  getPublicConfig(): { displayNames: Record<string, string>; roles: Record<string, string>; hierarchy: HierarchyEdge[] } {
    return {
      displayNames: { ...this.config.displayNames },
      roles: { ...this.config.roles },
      hierarchy: [...this.config.hierarchy],
    };
  }
}

export const pixdashConfig = new PixdashConfig();
