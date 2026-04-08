import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import type { BackendConfig, OpenClawConfig } from '../types/index.js';
import {
  DEFAULT_APPEARANCES_PATH,
  DEFAULT_GATEWAY_URL,
  DEFAULT_HOST,
  DEFAULT_LOG_LEVEL,
  DEFAULT_OFFICE_LAYOUT_PATH,
  DEFAULT_OPENCLAW_CONFIG_PATH,
  DEFAULT_PORT,
} from './defaults.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function readGatewayTokenFromConfig(configPath: string): string | undefined {
  if (!existsSync(configPath)) {
    return undefined;
  }

  const raw = readFileSync(configPath, 'utf8');
  // JSONC-safe: strip comments and trailing commas, then parse
  const stripped = raw
    .replace(/\/\/.*$/gm, '')          // strip single-line comments
    .replace(/,\s*([\]}])/g, '$1');     // strip trailing commas
  try {
    const parsed = JSON.parse(stripped) as OpenClawConfig;
    return parsed.gateway?.auth?.token;
  } catch {
    // Fallback: extract token with regex in case of other JSONC features
    const match = stripped.match(/"token"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }
}

export function loadConfig(): BackendConfig {
  const openClawConfigPath = process.env.PIXDASH_OPENCLAW_CONFIG ?? DEFAULT_OPENCLAW_CONFIG_PATH;
  const gatewayToken = process.env.PIXDASH_GATEWAY_TOKEN ?? readGatewayTokenFromConfig(openClawConfigPath);

  return {
    host: process.env.PIXDASH_HOST ?? DEFAULT_HOST,
    port: Number(process.env.PIXDASH_PORT ?? DEFAULT_PORT),
    logLevel: (process.env.PIXDASH_LOG_LEVEL ?? DEFAULT_LOG_LEVEL) as BackendConfig['logLevel'],
    gatewayUrl: process.env.PIXDASH_GATEWAY_URL ?? DEFAULT_GATEWAY_URL,
    gatewayToken,
    openClawConfigPath,
    appearancesPath: process.env.PIXDASH_APPEARANCES_PATH ?? DEFAULT_APPEARANCES_PATH,
    officeLayoutPath: process.env.PIXDASH_OFFICE_LAYOUT_PATH ?? DEFAULT_OFFICE_LAYOUT_PATH,
  };
}
