import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_PORT = 3000;
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789';

/**
 * Resolve the monorepo root by walking up from this file's directory.
 * Source: packages/backend/src/config/defaults.ts
 * Compiled: packages/backend/dist/config/defaults.js
 * Either way, four levels up reaches the monorepo root.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

export const DEFAULT_OFFICE_LAYOUT_PATH = path.join(MONOREPO_ROOT, 'assets', 'office-layout.json');

/**
 * OpenClaw config and appearances use the user's home directory.
 * These remain as relative references — callers in config/index.ts
 * should set PIXDASH_OPENCLAW_CONFIG / PIXDASH_APPEARANCES_PATH in
 * production.  The fallbacks below are kept minimal and portable.
 */
export const DEFAULT_OPENCLAW_CONFIG_PATH = path.join(
  process.env.HOME ?? '/root',
  '.openclaw',
  'openclaw.json',
);
export const DEFAULT_APPEARANCES_PATH = path.join(
  process.env.HOME ?? '/root',
  '.openclaw',
  'pixdash',
  'appearances.json',
);
