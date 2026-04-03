import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import appearanceSchema from '../schemas/appearance.schema.json' with { type: 'json' };
import type { Appearance, AppearancePatch } from '@pixdash/shared';
import { DEFAULT_APPEARANCE } from '@pixdash/shared';
import type { AppearanceStoreRecord } from '../types/index.js';
import { assertValid, createValidator } from '../utils/validation.js';

const validateAppearance = createValidator<Appearance>(appearanceSchema);

export class AppearanceStore {
  private readonly cache = new Map<string, AppearanceStoreRecord>();

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await this.load();
  }

  async get(agentId: string): Promise<Appearance> {
    if (this.cache.size === 0) {
      await this.load();
    }

    return structuredClone(this.cache.get(agentId)?.appearance ?? DEFAULT_APPEARANCE);
  }

  async set(agentId: string, appearance: Appearance): Promise<Appearance> {
    const validated = assertValid(validateAppearance, appearance, `Invalid appearance for ${agentId}`);
    this.cache.set(agentId, {
      updatedAt: new Date().toISOString(),
      appearance: structuredClone(validated),
    });
    await this.persist();
    return structuredClone(validated);
  }

  async merge(agentId: string, patch: AppearancePatch): Promise<Appearance> {
    const current = await this.get(agentId);
    const merged: Appearance = {
      ...current,
      ...patch,
      hair: {
        ...current.hair,
        ...patch.hair,
      },
      outfit: {
        ...current.outfit,
        ...patch.outfit,
      },
      accessories: patch.accessories ?? current.accessories ?? [],
    };

    return this.set(agentId, merged);
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, AppearanceStoreRecord>;
      this.cache.clear();
      for (const [agentId, entry] of Object.entries(parsed)) {
        this.cache.set(agentId, {
          updatedAt: entry.updatedAt,
          appearance: assertValid(validateAppearance, entry.appearance, `Invalid appearance in store for ${agentId}`),
        });
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async persist(): Promise<void> {
    const payload = Object.fromEntries(this.cache.entries());
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
}
