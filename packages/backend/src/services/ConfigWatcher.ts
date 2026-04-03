import { readFile } from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Agent } from '@pixdash/shared';
import type { BackendConfig, ConfigAgentSnapshot, OpenClawBinding, OpenClawConfig } from '../types/index.js';
import { AgentStateManager } from './AgentStateManager.js';

function firstStringLine(match: RegExpMatchArray | null): string | undefined {
  return match?.[1]?.trim();
}

async function safeRead(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function extractIdentity(markdown?: string): Agent['identity'] | undefined {
  if (!markdown) return undefined;
  const notes = [...markdown.matchAll(/^-\s+(.+)$/gm)].map((entry) => entry[1].trim());
  return {
    creature: firstStringLine(markdown.match(/\*\*Creature:\*\*\s*\n?([^\n]+)/)),
    vibe: firstStringLine(markdown.match(/\*\*Vibe:\*\*\s*\n?([^\n]+)/)),
    emoji: firstStringLine(markdown.match(/\*\*Emoji:\*\*\s*\n?([^\n]+)/)),
    avatar: firstStringLine(markdown.match(/\*\*Avatar:\*\*\s*\n?([^\n]+)/)),
    notes,
  };
}

function extractName(identityMarkdown: string | undefined, fallback: string): string {
  return firstStringLine(identityMarkdown?.match(/\*\*Name:\*\*\s*\n?([^\n]+)/) ?? null) ?? fallback;
}

function resolveModel(model: OpenClawConfig['agents'] extends { defaults?: { model?: infer T } } ? T : unknown): string | undefined {
  if (typeof model === 'string') return model;
  if (model && typeof model === 'object' && 'primary' in model && typeof model.primary === 'string') {
    return model.primary;
  }
  return undefined;
}

function resolveChannel(agentId: string, bindings: OpenClawBinding[] = []): string | undefined {
  return bindings.find((binding) => binding.agentId === agentId)?.match?.channel;
}

export class ConfigWatcher {
  private watcher?: FSWatcher;
  private trackedFiles = new Set<string>();

  constructor(
    private readonly config: BackendConfig,
    private readonly agentStateManager: AgentStateManager,
  ) {}

  async start(): Promise<void> {
    await this.scan();
    this.watcher = chokidar.watch([this.config.openClawConfigPath, ...this.trackedFiles], {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', () => void this.scan());
    this.watcher.on('change', () => void this.scan());
    this.watcher.on('unlink', () => void this.scan());
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
  }

  private async scan(): Promise<void> {
    const raw = await safeRead(this.config.openClawConfigPath);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as OpenClawConfig;
    this.trackedFiles.clear();

    const agents = parsed.agents?.list ?? [];
    await Promise.all(
      agents.map(async (entry) => {
        const workspace = entry.workspace ?? parsed.agents?.defaults?.workspace ?? `/home/pschivo/.openclaw/workspace-${entry.id}`;
        const soulPath = path.join(workspace, 'SOUL.md');
        const identityPath = path.join(workspace, 'IDENTITY.md');
        this.trackedFiles.add(soulPath);
        this.trackedFiles.add(identityPath);

        const soul = await safeRead(soulPath);
        const identityMarkdown = await safeRead(identityPath);
        const snapshot: ConfigAgentSnapshot = {
          id: entry.id,
          name: extractName(identityMarkdown, entry.name ?? entry.id),
          config: {
            model: resolveModel(entry.model) ?? resolveModel(parsed.agents?.defaults?.model),
            channel: resolveChannel(entry.id, parsed.bindings),
            workspace,
            source: this.config.openClawConfigPath,
            agentDir: entry.agentDir,
          },
          soul,
          identity: extractIdentity(identityMarkdown),
        };

        await this.agentStateManager.applyConfigSnapshot(snapshot);
        await this.agentStateManager.hydrateAppearance(entry.id);
      }),
    );

    if (this.watcher) {
      await this.watcher.add([...this.trackedFiles]);
    }
  }
}
