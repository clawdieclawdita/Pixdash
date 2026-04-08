import {
  createHash,
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as signMessage,
  type KeyObject,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';
import type { BackendConfig, GatewayEnvelope, GatewayLogEvent, GatewayStatusEvent, GatewayTaskEvent, OpenClawConfig } from '../types/index.js';
import { AgentStateManager } from './AgentStateManager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger(process.env.PIXDASH_LOG_LEVEL as never);

/** Strip JSONC comments without breaking // inside strings (URLs, etc.) */
function stripJsonc(json: string): string {
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
      inString = true; stringChar = ch; result += ch;
    } else if (ch === '/' && json[i + 1] === '/') {
      while (i < json.length && json[i] !== '\n') i++;
      continue;
    } else if (ch === '/' && json[i + 1] === '*') {
      i += 2;
      while (i < json.length && !(json[i] === '*' && json[i + 1] === '/')) i++;
      i += 2; continue;
    } else {
      result += ch;
    }
    i++;
  }
  return result.replace(/,\s*([\]}])/g, '$1');
}

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789';
const DEVICE_KEY_PATH = path.join(os.homedir(), '.openclaw', 'pixdash', 'device-key.json');
const GATEWAY_PROTOCOL_VERSION = 3;
type DeviceKeyRecord = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyBase64Url: string;
};

type ConnectChallengeMessage = {
  type: 'event';
  event: 'connect.challenge';
  payload?: {
    nonce?: string;
    ts?: number;
  };
};

type GatewayResponseMessage = {
  type: 'res';
  id?: string;
  ok?: boolean;
  payload?: {
    type?: string;
    protocol?: number;
    policy?: {
      tickIntervalMs?: number;
    };
    auth?: {
      deviceToken?: string;
      role?: string;
      scopes?: string[];
    };
    agents?: unknown;
  };
  error?: string;
};

export class GatewayClient {
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private presenceRequestTimeout?: NodeJS.Timeout;
  private requestId = 0;
  private reconnectAttempt = 0;
  private manuallyStopped = false;
  private readonly deviceKeys = this.loadOrCreateDeviceKeys();
  private deviceToken?: string;
  private pendingConnectRequestId?: string;
  private pendingPresenceRequestId?: string;

  constructor(
    private readonly config: BackendConfig,
    private readonly agentStateManager: AgentStateManager,
  ) {}

  start(): void {
    this.manuallyStopped = false;
    this.connect();
  }

  stop(): void {
    this.manuallyStopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.presenceRequestTimeout) {
      clearTimeout(this.presenceRequestTimeout);
      this.presenceRequestTimeout = undefined;
    }
    this.socket?.close();
  }

  private connect(): void {
    const gatewayUrl = this.resolveGatewayUrl();
    logger.info({ gatewayUrl }, 'Connecting to OpenClaw Gateway');
    this.socket = new WebSocket(gatewayUrl);
    this.pendingConnectRequestId = undefined;
    this.pendingPresenceRequestId = undefined;
    if (this.presenceRequestTimeout) {
      clearTimeout(this.presenceRequestTimeout);
      this.presenceRequestTimeout = undefined;
    }

    this.socket.on('open', () => {
      this.reconnectAttempt = 0;
      logger.info('Connected to OpenClaw Gateway transport; waiting for challenge');
    });

    this.socket.on('message', (data) => {
      void this.handleMessage(data.toString());
    });

    this.socket.on('error', (error) => {
      logger.warn({ err: error }, 'Gateway socket error');
    });

    this.socket.on('close', () => {
      logger.warn('Gateway socket closed');
      this.pendingConnectRequestId = undefined;
      this.pendingPresenceRequestId = undefined;
      if (!this.manuallyStopped) {
        this.scheduleReconnect();
      }
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let message: GatewayEnvelope;
    try {
      message = JSON.parse(raw) as GatewayEnvelope;
    } catch (error) {
      logger.warn({ raw, err: error }, 'Failed to parse Gateway message');
      return;
    }

    if (this.isConnectChallenge(message)) {
      this.handleConnectChallenge(message);
      return;
    }

    if (message.type === 'event' && message.event) {
      this.forwardEvent(message.event, message.payload);
      return;
    }

    if (message.type === 'res') {
      this.handleResponse(message as GatewayResponseMessage);
      return;
    }
  }

  private isConnectChallenge(message: GatewayEnvelope): message is GatewayEnvelope & ConnectChallengeMessage {
    return message.type === 'event' && message.event === 'connect.challenge';
  }

  private handleConnectChallenge(message: ConnectChallengeMessage): void {
    const challengeNonce = message.payload?.nonce;
    if (!challengeNonce) {
      logger.warn({ message }, 'Received malformed connect challenge');
      return;
    }

    const gatewayToken = this.resolveGatewayToken();
    if (!gatewayToken) {
      logger.warn('No Gateway token configured; cannot authenticate');
      return;
    }

    const signedAt = Date.now();
    const scopes = ['operator.read', 'operator.admin'];

    // v2 signature payload (Gateway tries v3 first, then falls back to v2)
    const signaturePayload = [
      'v2',
      this.deviceKeys.deviceId,
      'gateway-client',
      'backend',
      'operator',
      scopes.join(','),
      String(signedAt),
      gatewayToken,
      challengeNonce,
    ].join('|');
    const sig = signMessage(null, Buffer.from(signaturePayload, 'utf8'), this.getPrivateKey());
    const signature = Buffer.from(sig).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const requestId = this.nextRequestId();
    this.pendingConnectRequestId = requestId;

    this.send({
      type: 'req',
      id: requestId,
      method: 'connect',
      params: {
        minProtocol: GATEWAY_PROTOCOL_VERSION,
        maxProtocol: GATEWAY_PROTOCOL_VERSION,
        auth: {
          token: gatewayToken,
          deviceToken: this.deviceToken,
        },
        device: {
          id: this.deviceKeys.deviceId,
          publicKey: this.deviceKeys.publicKeyBase64Url,
          signature,
          signedAt,
          nonce: challengeNonce,
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.admin'],
        client: {
          id: 'gateway-client',
          displayName: 'PixDash',
          version: '1.0.0',
          platform: process.platform,
          mode: 'backend',
        },
      },
    });
  }

  private handleResponse(message: GatewayResponseMessage): void {
    if (!message.ok) {
      logger.warn({ message }, 'Gateway request failed');
      return;
    }

    if (message.id && message.id === this.pendingConnectRequestId && message.payload?.type === 'hello-ok') {
      this.pendingConnectRequestId = undefined;
      this.deviceToken = message.payload.auth?.deviceToken;
      logger.info(
        {
          protocol: message.payload.protocol,
          tickIntervalMs: message.payload.policy?.tickIntervalMs,
          role: message.payload.auth?.role,
          scopes: message.payload.auth?.scopes,
        },
        'Gateway authentication succeeded',
      );
      this.subscribeToEvents();
      this.requestAgentList();
      return;
    }

    if (message.id && message.id === this.pendingPresenceRequestId) {
      this.pendingPresenceRequestId = undefined;
      if (this.presenceRequestTimeout) {
        clearTimeout(this.presenceRequestTimeout);
        this.presenceRequestTimeout = undefined;
      }
      this.applyPresenceSnapshot(message.payload?.agents);
      return;
    }

    logger.debug({ message }, 'Gateway response received');
  }

  private subscribeToEvents(): void {
    this.send({
      type: 'req',
      id: this.nextRequestId(),
      method: 'sessions.subscribe',
      params: {},
    });
  }

  private requestAgentList(): void {
    const requestId = this.nextRequestId();
    this.pendingPresenceRequestId = requestId;
    if (this.presenceRequestTimeout) {
      clearTimeout(this.presenceRequestTimeout);
    }
    this.presenceRequestTimeout = setTimeout(() => {
      if (this.pendingPresenceRequestId === requestId) {
        logger.debug({ requestId }, 'Gateway agents.list timed out; waiting for health events instead');
        this.pendingPresenceRequestId = undefined;
        this.presenceRequestTimeout = undefined;
      }
    }, 5_000);
    this.send({
      type: 'req',
      id: requestId,
      method: 'agents.list',
      params: {},
    });
  }

  private applyPresenceSnapshot(payload: unknown): void {
    if (!Array.isArray(payload)) {
      return;
    }

    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const agentId = this.pickString((entry as Record<string, unknown>).agentId, (entry as Record<string, unknown>).id);
      const status = this.pickString((entry as Record<string, unknown>).status);
      const timestamp = this.pickString(
        (entry as Record<string, unknown>).timestamp,
        (entry as Record<string, unknown>).lastSeen,
      ) ?? new Date().toISOString();

      if (!agentId || !status || !this.isSupportedStatus(status)) {
        continue;
      }

      this.agentStateManager.applyStatusEvent({
        agentId,
        status,
        timestamp,
      });
    }
  }

  private applyHealthSnapshot(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const health = payload as Record<string, unknown>;
    const agents = health.agents;
    if (!Array.isArray(agents)) {
      return;
    }

    for (const entry of agents) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const agentId = this.pickString(record.agentId, record.id);
      if (!agentId) {
        continue;
      }

      const sessions = record.sessions;
      const recentSessions =
        sessions && typeof sessions === 'object'
          ? ((sessions as Record<string, unknown>).recent as Array<Record<string, unknown>> | undefined)
          : undefined;

      let status: GatewayStatusEvent['status'] = 'idle';
      let lastSeen = new Date().toISOString();

      if (Array.isArray(recentSessions) && recentSessions.length > 0) {
        const mostRecentSession = recentSessions[0];
        const ageMs = Number(mostRecentSession?.age ?? Number.POSITIVE_INFINITY);

        if (Number.isFinite(ageMs) && ageMs < 300_000) {
          status = 'online';
        } else if (Number.isFinite(ageMs) && ageMs < 3_600_000) {
          status = 'idle';
        } else {
          status = 'idle';
        }

        const updatedAtValue = mostRecentSession?.updatedAt;
        if (typeof updatedAtValue === 'number' && Number.isFinite(updatedAtValue)) {
          lastSeen = new Date(updatedAtValue).toISOString();
        } else if (typeof updatedAtValue === 'string' && updatedAtValue.length > 0) {
          const parsed = Number(updatedAtValue);
          lastSeen = Number.isFinite(parsed) ? new Date(parsed).toISOString() : updatedAtValue;
        }
      }

      this.agentStateManager.applyStatusEvent({
        agentId,
        status,
        timestamp: lastSeen,
      });
    }
  }

  private applySessionMessage(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const msg = payload as Record<string, unknown>;
    const agentId = this.resolveAgentIdFromSessionPayload(msg);
    if (!agentId) {
      logger.debug({ payload: JSON.stringify(payload).slice(0, 500) }, 'session.message: could not resolve agentId');
      return;
    }

    this.agentStateManager.recordActivity(agentId);

    const sessionKey = this.pickString(msg.sessionKey) ?? `agent:${agentId}`;
    const message = msg.message;
    if (!message || typeof message !== 'object') {
      return;
    }

    const messageRecord = message as Record<string, unknown>;
    const role = this.pickString(messageRecord.role);
    const content = Array.isArray(messageRecord.content)
      ? (messageRecord.content as Array<Record<string, unknown>>)
          .filter((part) => part.type === 'text')
          .map((part) => String(part.text ?? ''))
          .join(' ')
      : String(messageRecord.text ?? '');

    if (!content) {
      return;
    }

    const toolName = this.pickString(messageRecord.toolName);
    if (role === 'assistant' && toolName === 'session_send' && messageRecord.targetAgentId) {
      const targetAgentId = String(messageRecord.targetAgentId);
      if (targetAgentId && targetAgentId !== agentId) {
        this.agentStateManager.applyConferenceEvent({
          agentIds: [agentId, targetAgentId],
          sessionKey,
          source: 'session_send',
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (role === 'user') {
      this.agentStateManager.applyLogEvent({
        agentId,
        log: {
          id: `${sessionKey}:user:${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: content.slice(0, 200),
        },
      });
      return;
    }

    if (role === 'assistant' && content.length > 10) {
      this.agentStateManager.applyLogEvent({
        agentId,
        log: {
          id: `${sessionKey}:assistant:${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `💬 ${content.slice(0, 200)}`,
        },
      });
    }
  }

  private applySessionToolEvent(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const data = payload as Record<string, unknown>;
    const agentId = this.resolveAgentIdFromSessionPayload(data);
    if (!agentId) {
      logger.debug({ payload: JSON.stringify(payload).slice(0, 500) }, 'session.tool: could not resolve agentId');
      return;
    }

    this.agentStateManager.recordActivity(agentId);

    const sessionKey = this.pickString(data.sessionKey) ?? `agent:${agentId}`;
    const toolData = data.data;
    if (!toolData || typeof toolData !== 'object') {
      return;
    }

    const toolRecord = toolData as Record<string, unknown>;
    const toolName = this.pickString(toolRecord.name, toolRecord.toolName) ?? 'unknown';
    const phase = this.pickString(toolRecord.phase) ?? 'start';
    if (phase !== 'start') {
      return;
    }

    const args = toolRecord.args ?? toolRecord.arguments;
    let argsPreview = '{}';
    if (typeof args === 'string') {
      argsPreview = args.slice(0, 150);
    } else {
      try {
        argsPreview = JSON.stringify(args ?? {}).slice(0, 150);
      } catch {
        argsPreview = '[unserializable args]';
      }
    }

    this.agentStateManager.applyLogEvent({
      agentId,
      log: {
        id: `${sessionKey}:tool:${toolName}:${Date.now()}`,
        timestamp: this.pickString(data.ts) ?? new Date().toISOString(),
        level: 'info',
        message: `🔧 ${toolName}: ${argsPreview}`,
      },
    });
  }

  private resolveAgentIdFromSessionPayload(payload: Record<string, unknown>): string | undefined {
    const directAgentId = this.pickString(payload.agentId, payload.agent);
    if (directAgentId) {
      return directAgentId;
    }

    const route = payload.route;
    if (route && typeof route === 'object') {
      const routeRecord = route as Record<string, unknown>;
      const routedAgentId = this.pickString(routeRecord.agentId, routeRecord.agent);
      if (routedAgentId) {
        return routedAgentId;
      }
    }

    const sessionKey = this.pickString(payload.sessionKey, payload.sessionId);
    const match = sessionKey?.match(/^agent:([^:]+)/);
    return match?.[1];
  }

  private pickString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private isSupportedStatus(status: string): status is GatewayStatusEvent['status'] {
    return ['online', 'idle', 'busy', 'offline'].includes(status);
  }

  private forwardEvent(event: string, payload: unknown): void {
    logger.debug({ event }, 'Gateway event received');

    switch (event) {
      case 'agent.status':
      case 'agent:status':
        this.agentStateManager.applyStatusEvent(payload as GatewayStatusEvent);
        break;
      case 'agent.log':
      case 'agent:log':
        this.agentStateManager.applyLogEvent(payload as GatewayLogEvent);
        break;
      case 'agent.task':
      case 'agent:task':
        this.agentStateManager.applyTaskEvent(payload as GatewayTaskEvent);
        break;
      case 'health':
        this.applyHealthSnapshot(payload);
        break;
      case 'session.message':
        this.applySessionMessage(payload);
        break;
      case 'session.tool':
        this.applySessionToolEvent(payload);
        break;
      default:
        logger.debug({ event, payload }, 'Ignoring unsupported Gateway event');
    }
  }

  private resolveGatewayUrl(): string {
    return process.env.PIXDASH_GATEWAY_URL ?? this.config.gatewayUrl ?? DEFAULT_GATEWAY_URL;
  }

  private resolveGatewayToken(): string | undefined {
    return process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.PIXDASH_GATEWAY_TOKEN ?? this.config.gatewayToken ?? this.readGatewayTokenFromConfig();
  }

  private readGatewayTokenFromConfig(): string | undefined {
    const configPath = this.config.openClawConfigPath || path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) {
      return undefined;
    }

    try {
      const raw = readFileSync(configPath, 'utf8');
      // JSONC-safe comment stripping (preserves // inside strings like URLs)
      const stripped = stripJsonc(raw);
      const parsed = JSON.parse(stripped) as OpenClawConfig;
      return parsed.gateway?.auth?.token;
    } catch (error) {
      logger.warn({ err: error, configPath }, 'Failed to read Gateway token from OpenClaw config');
      return undefined;
    }
  }

  /**
   * Replicates the OpenClaw Gateway's own device identity derivation:
   * 1. Strip SPKI prefix → raw 32-byte Ed25519 public key
   * 2. device.id = SHA256(raw32).digest('hex')
   * 3. publicKey field = raw32 base64url encoded
   */
  private loadOrCreateDeviceKeys(): DeviceKeyRecord {
    mkdirSync(path.dirname(DEVICE_KEY_PATH), { recursive: true });

    const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

    const b64UrlEncode = (buf: Buffer): string =>
      buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    const deriveRawKey = (pem: string): Buffer => {
      const spki = createPublicKey(pem).export({ type: 'spki', format: 'der' });
      if (
        spki.length === ED25519_SPKI_PREFIX.length + 32 &&
        spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
      ) {
        return spki.subarray(ED25519_SPKI_PREFIX.length);
      }
      return spki;
    };

    const fingerprintKey = (pem: string): string => {
      const raw = deriveRawKey(pem);
      return createHash('sha256').update(raw).digest('hex');
    };

    if (existsSync(DEVICE_KEY_PATH)) {
      const stored = JSON.parse(readFileSync(DEVICE_KEY_PATH, 'utf8')) as Partial<DeviceKeyRecord>;
      if (stored.publicKeyPem && stored.privateKeyPem) {
        const deviceId = fingerprintKey(stored.publicKeyPem);
        const publicKeyBase64Url = b64UrlEncode(deriveRawKey(stored.publicKeyPem));
        const keys: DeviceKeyRecord = {
          deviceId,
          publicKeyPem: stored.publicKeyPem,
          privateKeyPem: stored.privateKeyPem,
          publicKeyBase64Url,
        };
        // Re-derive and store if deviceId changed
        if (stored.deviceId !== deviceId) {
          writeFileSync(DEVICE_KEY_PATH, JSON.stringify(keys, null, 2), 'utf8');
        }
        return keys;
      }
    }

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const deviceId = fingerprintKey(publicKeyPem);
    const publicKeyBase64Url = b64UrlEncode(deriveRawKey(publicKeyPem));
    const keys: DeviceKeyRecord = {
      deviceId,
      publicKeyPem,
      privateKeyPem,
      publicKeyBase64Url,
    };

    writeFileSync(DEVICE_KEY_PATH, JSON.stringify(keys, null, 2), 'utf8');
    return keys;
  }

  private getPrivateKey(): KeyObject {
    return createPrivateKey(this.deviceKeys.privateKeyPem);
  }

  private send(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    }
  }

  private scheduleReconnect(): void {
    const timeout = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    logger.info({ timeout }, 'Scheduling Gateway reconnect');
    this.reconnectTimer = setTimeout(() => this.connect(), timeout);
  }

  private nextRequestId(): string {
    this.requestId += 1;
    return `req_${this.requestId.toString().padStart(3, '0')}`;
  }
}
