# OpenClaw Gateway WebSocket Integration Guide

> **Target audience**: A competent Node.js developer who needs to connect a new application to an OpenClaw Gateway instance.
> **Time to reproduce**: ~30 minutes.
> **Definitive source**: `packages/backend/src/services/GatewayClient.ts`

---

## 1. Overview

The OpenClaw Gateway is a **WebSocket server** that serves as the central message bus for all OpenClaw agents. It exposes agent sessions, health events, tool calls, and presence data over a persistent bidirectional connection.

PixDash connects to the Gateway via **WebSocket only** — there is no HTTP REST API. The connection uses:

- **Transport**: WebSocket (`ws://` or `wss://`)
- **Auth**: Ed25519 challenge-response with a gateway token
- **Protocol**: JSON request/response + events (protocol version 3)
- **Default URL**: `ws://127.0.0.1:18789`

### Why this bypasses the "device approve" pairing flow

The standard OpenClaw companion app (mobile/desktop) uses a QR-code pairing flow that requires manual approval. PixDash bypasses this by:

1. **Presenting a valid `gateway.auth.token`** — this is the operator token stored in `~/.openclaw/openclaw.json` at `gateway.auth.token`
2. **Signing a cryptographic challenge** with a locally-generated Ed25519 key pair
3. **Requesting operator scopes** (`operator.read`, `operator.admin`)

The Gateway treats any client that completes this challenge-response as an authorized operator device.

> **Note on architecture:** PixDash's backend is **movement-authoritative** — it owns the collision map, A* pathfinding, movement tick loop (20Hz), waypoint claims, and idle wandering. The frontend is render-only with lerp interpolation. When building your own integration, you can choose where movement logic lives; PixDash puts it server-side for consistency.

---

## 2. Authentication Protocol

### Step 1: Load credentials

**2.1** The gateway token is resolved in this priority order:

```typescript
// From packages/backend/src/services/GatewayClient.ts
private resolveGatewayToken(): string | undefined {
  return (
    process.env.OPENCLAW_GATEWAY_TOKEN ??   // highest priority
    process.env.PIXDASH_GATEWAY_TOKEN ??    // app-specific override
    this.config.gatewayToken ??             // passed via BackendConfig
    this.readGatewayTokenFromConfig()       // read from openclaw.json
  );
}
```

**2.2** When reading from the OpenClaw config file, the file is JSONC (JSON with comments). A JSONC-safe parser must be used to strip `//` and `/* */` comments while preserving `//` inside strings:

```typescript
// Config path: ~/.openclaw/openclaw.json
const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
```

The token is at: `parsed.gateway.auth.token`

**2.3** The JSONC parser (full implementation from `GatewayClient.ts`):

```typescript
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
```

### Step 2: Generate connection parameters

**2.4** Generate or load an Ed25519 key pair. Keys are persisted at:

```
~/.openclaw/pixdash/device-key.json
```

**2.5** Device key storage format:

```typescript
type DeviceKeyRecord = {
  deviceId: string;           // SHA-256 hex of raw 32-byte public key
  publicKeyPem: string;       // SPKI PEM encoded Ed25519 public key
  privateKeyPem: string;      // PKCS#8 PEM encoded Ed25519 private key
  publicKeyBase64Url: string; // base64url of raw 32-byte public key
};
```

**2.6** Device ID derivation — EXACT algorithm:

```typescript
import { createHash, createPublicKey } from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

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

// deviceId = SHA-256 of raw 32-byte public key, full hex output
const deviceId = createHash('sha256')
  .update(deriveRawKey(publicKeyPem))
  .digest('hex');
```

**2.7** Public key for connect message (base64url of raw 32 bytes):

```typescript
const b64UrlEncode = (buf: Buffer): string =>
  buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const publicKeyBase64Url = b64UrlEncode(deriveRawKey(publicKeyPem));
```

**2.8** Connection parameter values used by PixDash:

| Parameter | Value |
|-----------|-------|
| `client.id` | `"gateway-client"` |
| `client.displayName` | `"PixDash"` |
| `client.version` | `"1.0.0"` |
| `client.platform` | `process.platform` |
| `client.mode` | `"backend"` |
| `scopes` | `["operator.read", "operator.admin"]` |
| `role` | `"operator"` |

### Step 3: Connect and authenticate

**3.1** Open a WebSocket to the Gateway URL:

```typescript
const socket = new WebSocket('ws://127.0.0.1:18789');
```

**3.2** Upon `open`, the Gateway immediately sends a challenge event:

```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": {
    "nonce": "<random-nonce-string>",
    "ts": 1713123456789
  }
}
```

**3.3** Construct the signature payload. The format is pipe-delimited (`v2` format):

```typescript
const scopes = ['operator.read', 'operator.admin'];
const signedAt = Date.now();

const signaturePayload = [
  'v2',
  deviceId,            // from Step 2.6
  'gateway-client',    // client.id
  'backend',           // client.mode
  'operator',          // role
  scopes.join(','),    // MUST match connect params scopes EXACTLY
  String(signedAt),
  gatewayToken,        // from Step 1
  challengeNonce,      // from connect.challenge payload
].join('|');
```

**3.4** Sign with Ed25519 private key:

```typescript
import { sign as signMessage, createPrivateKey } from 'node:crypto';

const sig = signMessage(
  null,
  Buffer.from(signaturePayload, 'utf8'),
  createPrivateKey(privateKeyPem)
);

const signature = Buffer.from(sig)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');
```

**3.5** Send the `connect` request:

```json
{
  "type": "req",
  "id": "req_001",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "auth": {
      "token": "<gateway-token>",
      "deviceToken": null
    },
    "device": {
      "id": "<deviceId-hex>",
      "publicKey": "<publicKeyBase64Url>",
      "signature": "<signature>",
      "signedAt": 1713123456789,
      "nonce": "<challenge-nonce>"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.admin"],
    "client": {
      "id": "gateway-client",
      "displayName": "PixDash",
      "version": "1.0.0",
      "platform": "linux",
      "mode": "backend"
    }
  }
}
```

> **Critical**: `scopes` in the signature payload MUST match `scopes` in the `params` field EXACTLY — same order, same values. A mismatch causes `AUTH_TOKEN_MISMATCH`.

**3.6** Gateway responds with `hello-ok`:

```json
{
  "type": "res",
  "id": "req_001",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "policy": {
      "tickIntervalMs": 30000
    },
    "auth": {
      "deviceToken": "<long-lived-device-token>",
      "role": "operator",
      "scopes": ["operator.read", "operator.admin"]
    },
    "agents": [...]
  }
}
```

Save `payload.auth.deviceToken` — it must be included in future `connect` requests to skip re-authentication for this device.

### Step 4: Post-authentication

After receiving `hello-ok`, immediately send these two requests:

**4.1** Subscribe to all session events:

```json
{
  "type": "req",
  "id": "req_002",
  "method": "sessions.subscribe",
  "params": {}
}
```

**4.2** Request agent list (presence snapshot):

```json
{
  "type": "req",
  "id": "req_003",
  "method": "agents.list",
  "params": {}
}
```

The `agents.list` response contains each agent's status and recent sessions. Subscribe to each session's messages (see Section 4).

---

## 3. Event Reference

### Inbound events (Gateway → Client)

| Event | Payload | When it fires | How PixDash processes it |
|-------|---------|---------------|------------------------|
| `connect.challenge` | `{ nonce: string, ts: number }` | Immediately after WebSocket opens | Triggers auth flow (sign challenge, send `connect`) |
| `health` | `{ agents: Array<{ agentId, sessions: { recent: Array<{ sessionKey, age, updatedAt }> } }> }` | Periodically (per `tickIntervalMs` from hello-ok) | Derives agent status from session age; subscribes to new sessions |
| `session.message` | `{ agentId?, sessionKey, message: { role, content, toolName?, targetAgentId? } }` | When any agent sends/receives a message | Records activity, logs content, detects inter-agent conference |
| `session.tool` | `{ agentId?, sessionKey, ts, data: { name, phase, args? } }` | When any agent invokes a tool | Records activity, logs tool name + args preview (phase=start only) |
| `agent.status` / `agent:status` | `{ agentId, status, timestamp }` | Agent status changes | Updates agent status in state manager |
| `agent.log` / `agent:log` | `{ agentId, log: { id, timestamp, level, message } }` | Agent log events | Appends to agent's log list |
| `agent.task` / `agent:task` | `{ agentId, task: { id, type, status, ... } }` | Agent task updates | Upserts task in agent's task list |
| `sessions.changed` | _(variable)_ | Session list changes | Not explicitly handled by PixDash |

### Outbound messages (Client → Gateway)

| Method | Params | Purpose |
|--------|--------|---------|
| `connect` | See Section 2.3.5 | Authenticate |
| `sessions.subscribe` | `{}` | Subscribe to all session events |
| `sessions.messages.subscribe` | `{ key: string }` | Subscribe to a specific session's messages |
| `agents.list` | `{}` | Request agent presence snapshot |

### Gateway envelope format

All messages share a common envelope:

```typescript
interface GatewayEnvelope {
  type: 'auth_challenge' | 'auth_response' | 'auth_success' | 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  event?: string;
  payload?: unknown;
  ok?: boolean;
  error?: string;
  nonce?: string;
  timestamp?: string;
  sessionId?: string;
}
```

---

## 4. Session Subscription

### 4.1 Global session subscription

After auth, send `sessions.subscribe({})` to receive events for ALL sessions:

```json
{ "type": "req", "id": "req_002", "method": "sessions.subscribe", "params": {} }
```

This enables `session.message` and `session.tool` events to flow.

### 4.2 Per-session message subscription

For each agent's recent sessions (discovered via `agents.list` response or `health` events), subscribe individually:

```json
{
  "type": "req",
  "id": "req_004",
  "method": "sessions.messages.subscribe",
  "params": { "key": "agent:agent-two:telegram:group:-100XXXXX:topic:XXX" }
}
```

### 4.3 Session key format

```
agent:<agentId>:<channel>:<channelType>:<channelId>[:topic:<topicId>]
```

Examples:
- `agent:agent-two:telegram:group:-100XXXXX:topic:XXX`
- `agent:agent-one:telegram:private:XXXXXXXXX`

### 4.4 Session discovery

Sessions are discovered from two sources:

1. **`agents.list` response** — each agent entry has `sessions.recent[]` with `sessionKey` and `key` fields
2. **`health` events** — each agent in the health snapshot has `sessions.recent[]`

PixDash tracks subscribed sessions in a `Set<string>` to avoid duplicate subscriptions.

---

## 5. Reconnection Logic

### 5.1 On disconnect

When the WebSocket closes (and the client was not stopped manually):

```typescript
// Exponential backoff, capped at 30 seconds
const timeout = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
reconnectAttempt += 1;
reconnectTimer = setTimeout(() => connect(), timeout);
```

### 5.2 On reconnect

1. `reconnectAttempt` resets to 0 on successful transport open
2. The full auth flow runs again (challenge → sign → connect)
3. **`deviceToken`** from the previous `hello-ok` is sent in the `auth` field — this may skip full re-auth
4. After successful auth:
   - `sessions.subscribe({})` is re-sent
   - `subscribedSessionKeys` is **cleared**
   - `agents.list` is re-requested to re-discover sessions
   - Each discovered session is re-subscribed

### 5.3 Error handling

- **Socket errors**: Logged as warnings; reconnection is scheduled via the close handler
- **Malformed challenge**: Logged as warning; auth does not proceed
- **No gateway token**: Logged as warning; auth does not proceed
- **Gateway request failure** (`ok: false`): Logged as warning
- **`agents.list` timeout**: 5-second timeout; falls back to waiting for `health` events

---

## 6. Reproduction Guide

### 6.1 Minimal package.json

```json
{
  "name": "openclaw-gateway-client",
  "type": "module",
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

No external crypto dependencies needed — all Ed25519 and SHA-256 operations use Node.js built-in `node:crypto`.

### 6.2 Minimal connect + authenticate

```typescript
import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign as signMessage } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

// --- JSONC parser (required for openclaw.json) ---
function stripJsonc(json: string): string {
  let result = '', inString = false, stringChar = '', i = 0;
  while (i < json.length) {
    const ch = json[i];
    if (inString) {
      result += ch;
      if (ch === '\\') { i++; if (i < json.length) result += json[i]; }
      else if (ch === stringChar) inString = false;
    } else if (ch === '"' || ch === "'") {
      inString = true; stringChar = ch; result += ch;
    } else if (ch === '/' && json[i + 1] === '/') {
      while (i < json.length && json[i] !== '\n') i++; continue;
    } else if (ch === '/' && json[i + 1] === '*') {
      i += 2;
      while (i < json.length && !(json[i] === '*' && json[i + 1] === '/')) i++;
      i += 2; continue;
    } else { result += ch; }
    i++;
  }
  return result.replace(/,\s*([\]}])/g, '$1');
}

// --- Key management ---
const KEY_PATH = path.join(os.homedir(), '.openclaw', 'my-client', 'device-key.json');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function b64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function loadOrCreateKeys() {
  if (existsSync(KEY_PATH)) {
    return JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const spki = createPublicKey(pubPem).export({ type: 'spki', format: 'der' });
  const raw = spki.subarray(SPKI_PREFIX.length);
  const keys = {
    deviceId: createHash('sha256').update(raw).digest('hex'),
    publicKeyPem: pubPem,
    privateKeyPem: privPem,
    publicKeyBase64Url: b64Url(raw),
  };
  writeFileSync(KEY_PATH, JSON.stringify(keys, null, 2));
  chmodSync(KEY_PATH, 0o600);
  return keys;
}

// --- Load gateway token ---
const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const config = JSON.parse(stripJsonc(readFileSync(configPath, 'utf8')));
const gatewayToken = config.gateway?.auth?.token;

// --- Connect ---
const keys = loadOrCreateKeys();
const scopes = ['operator.read', 'operator.admin'];
let reqId = 0;
const nextId = () => `req_${String(++reqId).padStart(3, '0')}`;

const ws = new WebSocket('ws://127.0.0.1:18789');

ws.on('open', () => {
  console.log('WebSocket open — waiting for challenge...');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  // Handle challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload?.nonce;
    const signedAt = Date.now();

    const signaturePayload = [
      'v2', keys.deviceId, 'gateway-client', 'backend',
      'operator', scopes.join(','), String(signedAt),
      gatewayToken, nonce,
    ].join('|');

    const sig = signMessage(
      null,
      Buffer.from(signaturePayload, 'utf8'),
      createPrivateKey(keys.privateKeyPem),
    );
    const signature = b64Url(Buffer.from(sig));

    ws.send(JSON.stringify({
      type: 'req', id: nextId(), method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        auth: { token: gatewayToken, deviceToken: null },
        device: {
          id: keys.deviceId,
          publicKey: keys.publicKeyBase64Url,
          signature, signedAt, nonce,
        },
        role: 'operator', scopes,
        client: { id: 'gateway-client', displayName: 'MyApp', version: '1.0.0', platform: process.platform, mode: 'backend' },
      },
    }));
    return;
  }

  // Handle hello-ok
  if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
    console.log('✅ Authenticated! Device token:', msg.payload.auth?.deviceToken?.slice(0, 16) + '...');
    // Subscribe to sessions
    ws.send(JSON.stringify({ type: 'req', id: nextId(), method: 'sessions.subscribe', params: {} }));
    // Request agent list
    ws.send(JSON.stringify({ type: 'req', id: nextId(), method: 'agents.list', params: {} }));
    return;
  }

  // Handle agents.list response — subscribe to sessions
  if (msg.type === 'res' && msg.id && Array.isArray(msg.payload)) {
    for (const agent of msg.payload) {
      const recent = agent.sessions?.recent ?? [];
      for (const s of recent) {
        const key = s.sessionKey ?? s.key;
        if (key) {
          ws.send(JSON.stringify({ type: 'req', id: nextId(), method: 'sessions.messages.subscribe', params: { key } }));
          console.log('Subscribed to session:', key);
        }
      }
    }
    return;
  }

  // Log all events
  if (msg.type === 'event') {
    console.log(`[EVENT] ${msg.event}:`, JSON.stringify(msg.payload).slice(0, 200));
  }
});

ws.on('close', () => console.log('Disconnected'));
ws.on('error', (err) => console.error('Socket error:', err.message));
```

### 6.3 Expected output

```
WebSocket open — waiting for challenge...
✅ Authenticated! Device token: eyJhbGciOiJIUzI1...
Subscribed to session: agent:agent-two:telegram:group:-100XXXXX:topic:XXX
Subscribed to session: agent:agent-one:telegram:group:-100XXXXX:topic:XXX
[EVENT] health: {"agents":[...]}
[EVENT] session.message: {"sessionKey":"agent:agent-two:...","message":{"role":"assistant",...}}
[EVENT] session.tool: {"sessionKey":"agent:agent-two:...","data":{"name":"read",...}}
```

---

## 7. Troubleshooting

### AUTH_TOKEN_MISMATCH

**Cause**: The scopes in the signature payload do not match the scopes in the `connect` params.

**Fix**: Ensure the `scopes.join(',')` in the signature payload uses the **exact same array** as `params.scopes`. Same order, same values.

```typescript
// CORRECT — same array reference
const scopes = ['operator.read', 'operator.admin'];
// Used in BOTH places:
// signaturePayload: scopes.join(',')
// params: { scopes }
```

### Device ID mismatch

**Cause**: The `device.id` sent in the connect message does not match the SHA-256 of the public key the Gateway has on record.

**Fix**: Delete `~/.openclaw/pixdash/device-key.json` and restart. A new key pair will be generated. Alternatively, re-derive the device ID from the PEM:

```typescript
const spki = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
const raw = spki.subarray(ED25519_SPKI_PREFIX.length);
const deviceId = createHash('sha256').update(raw).digest('hex');
```

### Scope mismatch

**Cause**: Requesting scopes not granted to the token, or omitting required scopes.

**Fix**: Use `['operator.read', 'operator.admin']` — these are the scopes PixDash uses and are standard for operator devices.

### Connection refused

**Cause**: Gateway is not running, or wrong URL/port.

**Fix**:
1. Verify the Gateway is running: `openclaw gateway status`
2. Check the URL — default is `ws://127.0.0.1:18789`
3. Override via `PIXDASH_GATEWAY_URL` env var or `config.gatewayUrl`

### No events received after auth

**Cause**: `sessions.subscribe({})` was not sent after `hello-ok`.

**Fix**: Ensure you send `sessions.subscribe` and `agents.list` immediately after receiving `hello-ok`. Also subscribe to individual sessions from the `agents.list` response.

### Session key format issues

**Cause**: Session keys must match the Gateway's internal format exactly.

**Fix**: Use the `sessionKey` or `key` field from the `agents.list` response or `health` events. Do not construct session keys manually. Format is: `agent:<agentId>:<channel>:<channelType>:<channelId>[:topic:<topicId>]`.
