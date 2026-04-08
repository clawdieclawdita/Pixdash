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
  // JSONC-safe: strip single-line comments but not // inside strings
  const stripped = stripJsoncComments(raw);
  try {
    const parsed = JSON.parse(stripped) as OpenClawConfig;
    return parsed.gateway?.auth?.token;
  } catch {
    // Fallback: extract gateway.auth.token with regex
    const match = stripped.match(/"gateway"[\s\S]*?"auth"[\s\S]*?"token"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }
}

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
      // Skip to end of line
      while (i < json.length && json[i] !== '\n') i++;
      continue;
    } else if (ch === '/' && json[i + 1] === '*') {
      // Skip block comments
      i += 2;
      while (i < json.length && !(json[i] === '*' && json[i + 1] === '/')) i++;
      i += 2;
      continue;
    } else {
      result += ch;
    }
    i++;
  }
  return result.replace(/,\s*([\]}])/g, '$1');
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
