# Nostr Classifieds Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SvelteKit static-site Nostr classifieds client (NIP-99 listings) with passkey/NIP-07/NIP-46 auth, relay-filtered search (category + geohash), drafts, image upload via Blossom, and seller DMs.

**Architecture:** SvelteKit + `adapter-static`, no backend. `@nostr/tools` for crypto/event helpers, `applesauce-core`/`applesauce-relay`/`applesauce-loaders` for relay pool and event store. Auth ported from `wikistr`'s passkey/PRF implementation with NIP-07/NIP-46 fallback via `nostr-tools`. Local persistence via `idb-keyval` (drafts, account cache) and `localStorage` (custom relays).

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Tailwind 4, `@nostr/tools`, `applesauce-core`/`applesauce-relay`/`applesauce-loaders`, `@nostr/gadgets`, `idb-keyval`, Vitest.

---

## Reference Source

The auth/relay infrastructure is ported from `/home/mattthomson/workspace/wikistr/src/lib/`:
- `passkeyIdentity.ts` — passkey PRF encryption, signer shim
- `nostr.ts` — signer wrapper, account store, relay bridging
- `security.ts` — relay URL sanitization
- `utils.ts` — `unique()` and other helpers
- `defaults.ts` — relay list patterns

---

### Task 1: Scaffold SvelteKit project

**Files:**
- Create: `package.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/app.html`
- Create: `src/app.css`
- Create: `src/routes/+layout.svelte`
- Create: `src/routes/+page.svelte`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "noteds",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.8",
    "@sveltejs/kit": "^2.64.0",
    "@sveltejs/vite-plugin-svelte": "^5.1.1",
    "@tailwindcss/vite": "^4.0.0",
    "@tailwindcss/forms": "^0.5.9",
    "@tailwindcss/typography": "^0.5.19",
    "svelte": "^5.56.3",
    "svelte-check": "^4.1.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.9.3",
    "vite": "^6.4.3",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "@nostr/gadgets": "npm:@jsr/nostr__gadgets@^0.0.21",
    "@nostr/tools": "npm:@jsr/nostr__tools@^2.12.0",
    "applesauce-core": "^6.1.0",
    "applesauce-loaders": "^6.1.0",
    "applesauce-relay": "^6.0.3",
    "idb-keyval": "^6.2.1"
  }
}
```

- [ ] **Step 2: Create `svelte.config.js`**

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [vitePreprocess({})],
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    alias: {
      $lib: 'src/lib',
      $components: 'src/components'
    }
  }
};

export default config;
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "module": "esnext",
    "moduleResolution": "bundler"
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
.svelte-kit
build
.env
.DS_Store
```

- [ ] **Step 6: Create `src/app.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>noteds</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 7: Create `src/app.css`**

```css
@import 'tailwindcss';
@plugin '@tailwindcss/forms';
@plugin '@tailwindcss/typography';
```

- [ ] **Step 8: Create minimal root layout `src/routes/+layout.svelte`**

```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-screen bg-gray-50 text-gray-900">
  <main class="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
    {@render children()}
  </main>
</div>
```

- [ ] **Step 9: Create placeholder home page `src/routes/+page.svelte`**

```svelte
<h1 class="text-2xl font-semibold">noteds</h1>
<p class="mt-2 text-gray-600">Nostr classifieds — feed coming soon.</p>
```

- [ ] **Step 10: Install dependencies and verify build**

Run: `npm install`
Expected: completes without error.

Run: `npm run build`
Expected: build succeeds, produces `build/` directory.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json svelte.config.js vite.config.ts tsconfig.json .gitignore src
git commit -m "Scaffold SvelteKit static site"
```

---

### Task 2: Security and utility helpers (with tests)

**Files:**
- Create: `src/lib/nostr/security.ts`
- Create: `src/lib/nostr/security.test.ts`
- Create: `src/lib/nostr/utils.ts`
- Create: `src/lib/nostr/utils.test.ts`

- [ ] **Step 1: Write failing tests for `security.ts`**

`src/lib/nostr/security.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sanitizeRelayUrl, isSecureRelayUrl, filterSecureRelays } from './security';

describe('sanitizeRelayUrl', () => {
  it('accepts wss URLs', () => {
    expect(sanitizeRelayUrl('wss://relay.example.com')).toBe('wss://relay.example.com/');
  });

  it('accepts ws URLs', () => {
    expect(sanitizeRelayUrl('ws://localhost:7777')).toBe('ws://localhost:7777/');
  });

  it('rejects non-websocket URLs', () => {
    expect(sanitizeRelayUrl('https://relay.example.com')).toBeNull();
  });

  it('rejects empty or invalid input', () => {
    expect(sanitizeRelayUrl('')).toBeNull();
    expect(sanitizeRelayUrl('not a url')).toBeNull();
    expect(sanitizeRelayUrl(undefined)).toBeNull();
  });
});

describe('isSecureRelayUrl', () => {
  it('returns true for valid relay urls', () => {
    expect(isSecureRelayUrl('wss://relay.example.com')).toBe(true);
  });

  it('returns false for invalid urls', () => {
    expect(isSecureRelayUrl('ftp://example.com')).toBe(false);
  });
});

describe('filterSecureRelays', () => {
  it('filters out invalid urls and normalizes valid ones', () => {
    expect(filterSecureRelays(['wss://a.com', 'bad', 'ws://b.com'])).toEqual([
      'wss://a.com/',
      'ws://b.com/'
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/security.test.ts`
Expected: FAIL with "Failed to resolve import './security'"

- [ ] **Step 3: Implement `security.ts`**

```ts
export function sanitizeRelayUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return null;
  }

  if (!parsed.hostname || parsed.hostname === 'undefined' || parsed.hostname === 'null') {
    return null;
  }

  return parsed.toString();
}

export function isSecureRelayUrl(url: string): boolean {
  return sanitizeRelayUrl(url) !== null;
}

export function filterSecureRelays(relays: string[]): string[] {
  return relays.map((url) => sanitizeRelayUrl(url)).filter((url): url is string => url !== null);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/security.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write failing tests for `utils.ts`**

`src/lib/nostr/utils.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { unique, getTagOr, getA } from './utils';

describe('unique', () => {
  it('merges arrays and removes duplicates, preserving order', () => {
    expect(unique(['a', 'b'], ['b', 'c'], ['a', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns empty array for no input', () => {
    expect(unique()).toEqual([]);
  });
});

describe('getTagOr', () => {
  it('returns the tag value when present', () => {
    const event = { tags: [['title', 'Bike']] } as any;
    expect(getTagOr(event, 'title')).toBe('Bike');
  });

  it('returns the default when tag is absent', () => {
    const event = { tags: [] } as any;
    expect(getTagOr(event, 'title', 'Untitled')).toBe('Untitled');
  });
});

describe('getA', () => {
  it('builds the kind:pubkey:d-tag address', () => {
    const event = { kind: 30402, pubkey: 'abc123', tags: [['d', 'my-id']] } as any;
    expect(getA(event)).toBe('30402:abc123:my-id');
  });

  it('uses an empty d-tag when missing', () => {
    const event = { kind: 30402, pubkey: 'abc123', tags: [] } as any;
    expect(getA(event)).toBe('30402:abc123:');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/utils.test.ts`
Expected: FAIL with "Failed to resolve import './utils'"

- [ ] **Step 7: Implement `utils.ts`**

```ts
import type { NostrEvent } from '@nostr/tools/pure';

export function unique<A>(...arrs: A[][]): A[] {
  const result: A[] = [];
  for (const arr of arrs) {
    for (const item of arr) {
      if (result.indexOf(item) === -1) result.push(item);
    }
  }
  return result;
}

export function getTagOr(event: NostrEvent, tagName: string, dflt: string = ''): string {
  return event.tags.find(([t]) => t === tagName)?.[1] || dflt;
}

export function getAllTags(event: NostrEvent, tagName: string): string[] {
  return event.tags.filter(([t]) => t === tagName).map(([, v]) => v);
}

export function getA(event: NostrEvent): string {
  const dTag = event.tags.find(([t, v]) => t === 'd' && v)?.[1] || '';
  return `${event.kind}:${event.pubkey}:${dTag}`;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/utils.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/nostr/security.ts src/lib/nostr/security.test.ts src/lib/nostr/utils.ts src/lib/nostr/utils.test.ts
git commit -m "Add relay URL sanitization and event tag utilities"
```

---

### Task 3: Geohash encoding (with tests)

**Files:**
- Create: `src/lib/nostr/geohash.ts`
- Create: `src/lib/nostr/geohash.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/nostr/geohash.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { encodeGeohash } from './geohash';

describe('encodeGeohash', () => {
  it('encodes London coordinates to a known prefix', () => {
    expect(encodeGeohash(51.5074, -0.1278, 6)).toBe('gcpvj0');
  });

  it('encodes Austin, TX coordinates to a known prefix', () => {
    expect(encodeGeohash(30.2672, -97.7431, 5)).toBe('9v6kp');
  });

  it('respects the requested precision', () => {
    expect(encodeGeohash(0, 0, 1)).toHaveLength(1);
    expect(encodeGeohash(0, 0, 9)).toHaveLength(9);
  });

  it('defaults to precision 6', () => {
    expect(encodeGeohash(51.5074, -0.1278)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/geohash.test.ts`
Expected: FAIL with "Failed to resolve import './geohash'"

- [ ] **Step 3: Implement `geohash.ts`**

```ts
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lon: number, precision: number = 6): string {
  const latRange: [number, number] = [-90, 90];
  const lonRange: [number, number] = [-180, 180];
  let geohash = '';
  let bit = 0;
  let ch = 0;
  let evenBit = true;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (lon >= mid) {
        ch |= 1 << (4 - bit);
        lonRange[0] = mid;
      } else {
        lonRange[1] = mid;
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        latRange[0] = mid;
      } else {
        latRange[1] = mid;
      }
    }
    evenBit = !evenBit;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/geohash.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nostr/geohash.ts src/lib/nostr/geohash.test.ts
git commit -m "Add geohash encoding for location-based search"
```

---

### Task 4: Port passkey identity module (with tests)

**Files:**
- Create: `src/lib/nostr/passkeyIdentity.ts`
- Create: `src/lib/nostr/passkeyIdentity.test.ts`

> Note: WebAuthn/PRF-dependent functions (`registerPasskeyIdentity`, `importPasskeyIdentityFromNsec`, `unlockPasskeyIdentity`, `enrollPasskeyCredential`) are not unit tested here since they require real WebAuthn ceremonies; they'll be exercised manually in Task 17 (Settings page).

- [ ] **Step 1: Write failing tests**

`src/lib/nostr/passkeyIdentity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  bytesToHex,
  hexToBytes,
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer
} from './passkeyIdentity';

describe('bytesToHex / hexToBytes', () => {
  it('round-trips bytes through hex', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 16]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('produces lowercase, zero-padded hex', () => {
    expect(bytesToHex(new Uint8Array([0, 255, 16]))).toBe('00ff10');
  });

  it('handles empty input', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('');
    expect(hexToBytes('')).toEqual(new Uint8Array([]));
  });

  it('throws on invalid hex', () => {
    expect(() => hexToBytes('zz')).toThrow();
    expect(() => hexToBytes('abc')).toThrow();
  });
});

describe('arrayBufferToBase64Url / base64UrlToArrayBuffer', () => {
  it('round-trips a buffer with no padding needed (length % 3 === 0)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips a buffer needing one padding char (length % 3 === 2)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips a buffer needing two padding chars (length % 3 === 1)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips an empty buffer', () => {
    const bytes = new Uint8Array([]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips a 32-byte buffer (typical PRF key length)', () => {
    const bytes = new Uint8Array(32).map((_, i) => i * 7 % 256);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/passkeyIdentity.test.ts`
Expected: FAIL with "Failed to resolve import './passkeyIdentity'"

- [ ] **Step 3: Implement `passkeyIdentity.ts`**

`src/lib/nostr/passkeyIdentity.ts`:
```ts
import { generateSecretKey, getPublicKey, finalizeEvent, type EventTemplate, type Event } from '@nostr/tools/pure'
import { decode } from '@nostr/tools/nip19'
import { encrypt as nip04Encrypt, decrypt as nip04Decrypt } from '@nostr/tools/nip04'
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt } from '@nostr/tools/nip44'

const STORAGE_KEY = 'noteds:passkey-identity'

export interface PasskeyIdentityRecord {
  version: 1
  credentialId: string
  encryptedNsec: string
  pubkey: string
}

// Derived for 'noteds' (SHA-256 of a noteds-specific label)
const PRF_SALT = new Uint8Array([
  84, 12, 201, 9, 144, 233, 71, 188, 5, 99, 142, 60, 219, 31, 7, 250,
  128, 33, 176, 92, 14, 201, 88, 47, 163, 200, 19, 102, 58, 240, 6, 177
])

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function isValidRecord(value: unknown): value is PasskeyIdentityRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.version === 1 &&
    typeof record.credentialId === 'string' &&
    typeof record.encryptedNsec === 'string' &&
    typeof record.pubkey === 'string'
  )
}

function readStoredRecord(): PasskeyIdentityRecord | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    return isValidRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function hasStoredPasskeyIdentity(): boolean {
  return readStoredRecord() !== null
}

export function getStoredPasskeyPubkey(): string | null {
  const record = readStoredRecord()
  return record ? record.pubkey : null
}

export function clearPasskeyIdentity(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export async function isPRFSupported(): Promise<boolean> {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof navigator?.credentials?.create === 'function'
  )
}

async function normalizePRFKey(prfResult: ArrayBuffer): Promise<Uint8Array> {
  if (prfResult.byteLength === 32) {
    return new Uint8Array(prfResult)
  }
  const digest = await crypto.subtle.digest('SHA-256', prfResult)
  return new Uint8Array(digest)
}

function extractPRFResult(credential: PublicKeyCredential): ArrayBuffer | undefined {
  const extensions = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
  return extensions.prf?.results?.first
}

function parseImportedSecretKey(input: string): Uint8Array {
  const cleaned = input.trim()
  if (!cleaned) {
    throw new Error('Please provide a Nostr secret key.')
  }
  if (/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    return hexToBytes(cleaned)
  }
  const decoded = decode(cleaned)
  if (decoded.type === 'nsec') {
    return decoded.data
  }
  throw new Error('Please provide a valid nsec or 64-character hex secret key.')
}

async function enrollPasskeyCredential(): Promise<{ credentialId: string; prfKey: Uint8Array }> {
  if (!(await isPRFSupported())) {
    throw new Error('Passkeys are not supported in this browser.')
  }
  const prfSalt = PRF_SALT
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Noteds', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'noteds-identity',
        displayName: 'Noteds Identity',
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey registration was cancelled.')
  }

  let prfResult = extractPRFResult(credential)

  if (prfResult === undefined) {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: credential.rawId, type: 'public-key' }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    })) as PublicKeyCredential | null

    if (assertion) {
      prfResult = extractPRFResult(assertion)
    }
  }

  if (prfResult === undefined) {
    throw new Error('This device does not support passkey-based encryption (PRF extension required).')
  }

  return {
    credentialId: arrayBufferToBase64Url(credential.rawId),
    prfKey: await normalizePRFKey(prfResult),
  }
}

async function persistPasskeyIdentity(secretKey: Uint8Array, credentialId: string, prfKey: Uint8Array): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const pubkey = getPublicKey(secretKey)
  const encryptedNsec = nip44Encrypt(bytesToHex(secretKey), prfKey)
  const record: PasskeyIdentityRecord = { version: 1, credentialId, encryptedNsec, pubkey }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  return { secretKey, pubkey }
}

export async function registerPasskeyIdentity(): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const { credentialId, prfKey } = await enrollPasskeyCredential()
  const secretKey = generateSecretKey()
  return persistPasskeyIdentity(secretKey, credentialId, prfKey)
}

export async function importPasskeyIdentityFromNsec(nsec: string): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const secretKey = parseImportedSecretKey(nsec)
  const { credentialId, prfKey } = await enrollPasskeyCredential()
  return persistPasskeyIdentity(secretKey, credentialId, prfKey)
}

export async function unlockPasskeyIdentity(): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const record = readStoredRecord()
  if (!record) {
    throw new Error('No passkey identity found on this device.')
  }
  const prfSalt = PRF_SALT
  const credentialIdBytes = base64UrlToArrayBuffer(record.credentialId)
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: credentialIdBytes, type: 'public-key' }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey unlock was cancelled.')
  }

  const prfResult = extractPRFResult(credential)
  if (prfResult === undefined) {
    throw new Error('Passkey unlock failed: PRF extension result unavailable.')
  }

  const prfKey = await normalizePRFKey(prfResult)
  const nsecHex = nip44Decrypt(record.encryptedNsec, prfKey)
  const secretKey = hexToBytes(nsecHex)
  return { secretKey, pubkey: record.pubkey }
}

export interface PasskeySignerShim {
  getPublicKey: () => Promise<string>
  signEvent: (template: EventTemplate) => Promise<Event>
  nip04: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>
  }
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>
  }
  __notedsPasskey: true
}

export function buildPasskeySignerShim(secretKey: Uint8Array): PasskeySignerShim {
  return {
    getPublicKey: async () => getPublicKey(secretKey),
    signEvent: async (template: EventTemplate) => finalizeEvent(template, secretKey),
    nip04: {
      encrypt: async (pubkey: string, plaintext: string) => nip04Encrypt(secretKey, pubkey, plaintext),
      decrypt: async (pubkey: string, ciphertext: string) => nip04Decrypt(secretKey, pubkey, ciphertext),
    },
    nip44: {
      encrypt: async (pubkey: string, plaintext: string) => nip44Encrypt(secretKey, pubkey, plaintext),
      decrypt: async (pubkey: string, ciphertext: string) => nip44Decrypt(secretKey, pubkey, ciphertext),
    },
    __notedsPasskey: true,
  }
}

export function isPasskeyShim(nostr: unknown): boolean {
  return !!nostr && typeof nostr === 'object' && (nostr as { __notedsPasskey?: unknown }).__notedsPasskey === true
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/passkeyIdentity.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nostr/passkeyIdentity.ts src/lib/nostr/passkeyIdentity.test.ts
git commit -m "Port passkey identity module with PRF-based key encryption"
```

---

### Task 5: Signer wrapper, account store, and relay pool

**Files:**
- Create: `src/lib/nostr/relays.ts`
- Create: `src/lib/nostr/relays.test.ts`
- Create: `src/lib/nostr/signer.ts`

> Note: `signer.ts` itself is not unit tested — it depends on the DOM, WebAuthn, `sessionStorage`/`localStorage`, and the relay pool/network, which are exercised manually via Settings (Task 17) and other pages.

- [ ] **Step 1: Write failing tests for `relays.ts`**

`src/lib/nostr/relays.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_RELAYS, getCustomRelays, setCustomRelays, getActiveRelays } from './relays';

describe('DEFAULT_RELAYS', () => {
  it('has at least 4 entries, all ws/wss', () => {
    expect(DEFAULT_RELAYS.length).toBeGreaterThanOrEqual(4);
    for (const url of DEFAULT_RELAYS) {
      expect(url).toMatch(/^wss?:\/\//);
    }
  });
});

describe('getCustomRelays', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns [] when nothing stored', () => {
    expect(getCustomRelays()).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    localStorage.setItem('noteds:custom-relays', 'not json');
    expect(getCustomRelays()).toEqual([]);
  });
});

describe('setCustomRelays / getCustomRelays round trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips valid relay URLs', () => {
    setCustomRelays(['wss://my.relay.example']);
    expect(getCustomRelays()).toEqual(['wss://my.relay.example/']);
  });

  it('filters out invalid URLs', () => {
    setCustomRelays(['wss://good.example', 'not-a-url', 'https://bad.example']);
    expect(getCustomRelays()).toEqual(['wss://good.example/']);
  });
});

describe('getActiveRelays', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('merges custom and default relays without duplicates', () => {
    setCustomRelays([DEFAULT_RELAYS[0], 'wss://extra.example']);
    const active = getActiveRelays();
    expect(active).toContain('wss://extra.example/');
    expect(active.filter((r) => r === DEFAULT_RELAYS[0]).length).toBe(1);
    for (const url of DEFAULT_RELAYS) {
      expect(active).toContain(url);
    }
  });

  it('returns just the defaults when no custom relays are set', () => {
    expect(getActiveRelays()).toEqual(DEFAULT_RELAYS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/relays.test.ts`
Expected: FAIL with "Failed to resolve import './relays'"

- [ ] **Step 3: Implement `relays.ts`**

`src/lib/nostr/relays.ts`:
```ts
import { filterSecureRelays } from './security';
import { unique } from './utils';

const CUSTOM_RELAYS_KEY = 'noteds:custom-relays';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://purplepag.es'
];

export function getCustomRelays(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(CUSTOM_RELAYS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return filterSecureRelays(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return [];
  }
}

export function setCustomRelays(relays: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_RELAYS_KEY, JSON.stringify(filterSecureRelays(relays)));
}

export function getActiveRelays(): string[] {
  return unique(getCustomRelays(), DEFAULT_RELAYS);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/relays.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Implement `signer.ts`**

`src/lib/nostr/signer.ts`:
```ts
import { readable } from 'svelte/store';
import * as idbkv from 'idb-keyval';
import { RelayPool } from 'applesauce-relay';
import { EventStore } from 'applesauce-core';
import { loadNostrUser, type NostrUser } from '@nostr/gadgets/metadata';

import type { EventTemplate, Event } from '@nostr/tools/pure';
import type { PasskeySignerShim } from './passkeyIdentity';
import { buildPasskeySignerShim, hexToBytes, bytesToHex, isPasskeyShim } from './passkeyIdentity';

export const relayPool = new RelayPool();
export const eventStore = new EventStore();

let passkeySignerShim: PasskeySignerShim | null = null;
let restoredPasskeyPubkey: string | null = null;
let nostrBridgePromise: Promise<void> | null = null;

function hasActivePasskeySession(): boolean {
  if (passkeySignerShim) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    sessionStorage.getItem('noteds:passkey_session_nsec') !== null &&
    sessionStorage.getItem('noteds:passkey_session_pubkey') !== null
  );
}

async function ensureWindowNostrBridge(): Promise<void> {
  if (typeof window === 'undefined' || (window as any).nostr || hasActivePasskeySession()) {
    return;
  }

  if (!nostrBridgePromise) {
    nostrBridgePromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load the remote signer bridge'));
      document.head.appendChild(script);
    }).finally(() => {
      nostrBridgePromise = null;
    });
  }

  await nostrBridgePromise;
}

function getActiveSigner(): PasskeySignerShim | null {
  if (passkeySignerShim) {
    return passkeySignerShim;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  const nostr = (window as any).nostr;
  return nostr && typeof nostr.getPublicKey === 'function' && typeof nostr.signEvent === 'function'
    ? (nostr as PasskeySignerShim)
    : null;
}

export function hasActiveSigner(): boolean {
  return getActiveSigner() !== null;
}

if (typeof window !== 'undefined') {
  const sessionNsec = sessionStorage.getItem('noteds:passkey_session_nsec');
  if (sessionNsec) {
    try {
      const secretKey = hexToBytes(sessionNsec);
      passkeySignerShim = buildPasskeySignerShim(secretKey);
      (window as any).nostr = passkeySignerShim;
      restoredPasskeyPubkey = sessionStorage.getItem('noteds:passkey_session_pubkey');
    } catch (e) {
      sessionStorage.removeItem('noteds:passkey_session_nsec');
      sessionStorage.removeItem('noteds:passkey_session_pubkey');
      console.error('Failed to restore passkey session', e);
    }
  }
}

async function withSigner<T>(fn: (nostr: PasskeySignerShim) => Promise<T>): Promise<T> {
  let nostr = getActiveSigner();
  if (!nostr && typeof window !== 'undefined') {
    await ensureWindowNostrBridge();
    nostr = getActiveSigner();
  }
  if (!nostr) {
    throw new Error('No Nostr signer is available.');
  }
  return fn(nostr);
}

export const signer = {
  getPublicKey: async () => {
    const pubkey = await withSigner((nostr) => nostr.getPublicKey());
    setAccount(pubkey);
    return pubkey;
  },
  signEvent: async (event: EventTemplate): Promise<Event> => {
    const se = await withSigner((nostr) => nostr.signEvent(event));
    setAccount(se.pubkey);
    return se;
  },
  nip04: {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip04.encrypt(pubkey, plaintext)),
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip04.decrypt(pubkey, ciphertext)),
  },
  nip44: {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip44.encrypt(pubkey, plaintext)),
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip44.decrypt(pubkey, ciphertext)),
  },
};

let setAccount: (_: string | null) => Promise<void>;
export const account = readable<NostrUser | null>(null, (set) => {
  setAccount = async (pubkey: string | null) => {
    if (!pubkey) {
      await idbkv.del('noteds:loggedin');
      set(null);
      return;
    }
    const acct = await loadNostrUser(pubkey);
    idbkv.set('noteds:loggedin', acct);
    set(acct);
  };

  if (restoredPasskeyPubkey) {
    setAccount(restoredPasskeyPubkey);
    restoredPasskeyPubkey = null;
    return;
  }

  setTimeout(async () => {
    const data = await idbkv.get('noteds:loggedin');
    if (data) set(data);
  }, 700);
});

export async function completePasskeySession(secretKey: Uint8Array, pubkey: string): Promise<void> {
  sessionStorage.setItem('noteds:passkey_session_nsec', bytesToHex(secretKey));
  sessionStorage.setItem('noteds:passkey_session_pubkey', pubkey);
  passkeySignerShim = buildPasskeySignerShim(secretKey);
  (window as any).nostr = passkeySignerShim;
  await setAccount(pubkey);
}

export async function logout(): Promise<void> {
  sessionStorage.removeItem('noteds:passkey_session_nsec');
  sessionStorage.removeItem('noteds:passkey_session_pubkey');
  passkeySignerShim = null;
  if (typeof window !== 'undefined') {
    if (isPasskeyShim((window as any).nostr)) {
      delete (window as any).nostr;
    }
  }
  await setAccount(null);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/nostr/relays.ts src/lib/nostr/relays.test.ts src/lib/nostr/signer.ts
git commit -m "Add signer wrapper, account store, and relay pool"
```

---

### Task 6: NIP-99 listing event builders (with tests)

**Files:**
- Create: `src/lib/nostr/listings.ts`
- Create: `src/lib/nostr/listings.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/nostr/listings.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildListingEvent, parseListingEvent, type ListingInput } from './listings';

const fullInput: ListingInput = {
  id: 'abc-123',
  title: 'Mountain Bike',
  summary: 'Lightly used mountain bike',
  price: { amount: '250', currency: 'USD' },
  location: 'Downtown Austin, TX',
  geohash: '9v6kp',
  categories: ['bicycles', 'sporting-goods'],
  images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
  status: 'active',
  content: '# Mountain Bike\n\nGreat condition.'
};

describe('buildListingEvent', () => {
  it('builds a kind 30402 event for published listings', () => {
    const event = buildListingEvent(fullInput, false);
    expect(event.kind).toBe(30402);
    expect(event.content).toBe(fullInput.content);
    expect(event.tags).toContainEqual(['d', 'abc-123']);
    expect(event.tags).toContainEqual(['title', 'Mountain Bike']);
    expect(event.tags).toContainEqual(['summary', 'Lightly used mountain bike']);
    expect(event.tags).toContainEqual(['price', '250', 'USD']);
    expect(event.tags).toContainEqual(['location', 'Downtown Austin, TX']);
    expect(event.tags).toContainEqual(['g', '9v6kp']);
    expect(event.tags).toContainEqual(['t', 'bicycles']);
    expect(event.tags).toContainEqual(['t', 'sporting-goods']);
    expect(event.tags).toContainEqual(['image', 'https://example.com/a.jpg']);
    expect(event.tags).toContainEqual(['image', 'https://example.com/b.jpg']);
    expect(event.tags).toContainEqual(['status', 'active']);
    expect(typeof event.created_at).toBe('number');
  });

  it('builds a kind 30403 event for drafts', () => {
    const event = buildListingEvent(fullInput, true);
    expect(event.kind).toBe(30403);
  });

  it('omits location and g tags when not provided', () => {
    const { location, geohash, ...rest } = fullInput;
    const input: ListingInput = { ...rest, categories: [...fullInput.categories], images: [...fullInput.images] };
    const event = buildListingEvent(input, false);
    expect(event.tags.find(([t]) => t === 'location')).toBeUndefined();
    expect(event.tags.find(([t]) => t === 'g')).toBeUndefined();
  });
});

describe('parseListingEvent', () => {
  it('round-trips a full listing through build and parse', () => {
    const event = { ...buildListingEvent(fullInput, false), pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    expect(parseListingEvent(event)).toEqual(fullInput);
  });

  it('round-trips a listing without optional location/geohash', () => {
    const { location, geohash, ...rest } = fullInput;
    const input: ListingInput = { ...rest, categories: [...fullInput.categories], images: [...fullInput.images] };
    const event = { ...buildListingEvent(input, false), pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    const parsed = parseListingEvent(event);
    expect(parsed.location).toBeUndefined();
    expect(parsed.geohash).toBeUndefined();
  });

  it('preserves multiple categories and images in order', () => {
    const event = { ...buildListingEvent(fullInput, false), pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    const parsed = parseListingEvent(event);
    expect(parsed.categories).toEqual(['bicycles', 'sporting-goods']);
    expect(parsed.images).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('defaults status to active when the status tag is missing', () => {
    const event = buildListingEvent(fullInput, false);
    event.tags = event.tags.filter(([t]) => t !== 'status');
    const fullEvent = { ...event, pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    expect(parseListingEvent(fullEvent).status).toBe('active');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/listings.test.ts`
Expected: FAIL with "Failed to resolve import './listings'"

- [ ] **Step 3: Implement `listings.ts`**

`src/lib/nostr/listings.ts`:
```ts
import type { EventTemplate, NostrEvent } from '@nostr/tools/pure';
import { getTagOr, getAllTags } from './utils';

export interface ListingInput {
  id: string;
  title: string;
  summary: string;
  price: { amount: string; currency: string };
  location?: string;
  geohash?: string;
  categories: string[];
  images: string[];
  status: 'active' | 'sold';
  content: string;
}

export function buildListingEvent(input: ListingInput, draft: boolean): EventTemplate {
  const tags: string[][] = [
    ['d', input.id],
    ['title', input.title],
    ['summary', input.summary],
    ['price', input.price.amount, input.price.currency],
  ];

  if (input.location) {
    tags.push(['location', input.location]);
  }
  if (input.geohash) {
    tags.push(['g', input.geohash]);
  }
  for (const category of input.categories) {
    tags.push(['t', category]);
  }
  for (const image of input.images) {
    tags.push(['image', image]);
  }
  tags.push(['status', input.status]);

  return {
    kind: draft ? 30403 : 30402,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: input.content,
  };
}

export function parseListingEvent(event: NostrEvent): ListingInput {
  const priceTag = event.tags.find(([t]) => t === 'price');
  const location = event.tags.find(([t]) => t === 'location')?.[1];
  const geohash = event.tags.find(([t]) => t === 'g')?.[1];
  const status = getTagOr(event, 'status', 'active') as 'active' | 'sold';

  return {
    id: getTagOr(event, 'd'),
    title: getTagOr(event, 'title'),
    summary: getTagOr(event, 'summary'),
    price: { amount: priceTag?.[1] || '', currency: priceTag?.[2] || '' },
    ...(location !== undefined ? { location } : {}),
    ...(geohash !== undefined ? { geohash } : {}),
    categories: getAllTags(event, 't'),
    images: getAllTags(event, 'image'),
    status,
    content: event.content,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/listings.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nostr/listings.ts src/lib/nostr/listings.test.ts
git commit -m "Add NIP-99 listing event builders and parsers"
```

---

### Task 7: Drafts persistence (with tests)

**Files:**
- Create: `src/lib/nostr/drafts.ts`
- Create: `src/lib/nostr/drafts.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/nostr/drafts.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('idb-keyval', () => {
  const stores = new Map<string, Map<string, unknown>>();

  function getStoreMap(storeId: unknown): Map<string, unknown> {
    const key = typeof storeId === 'string' ? storeId : 'default';
    let store = stores.get(key);
    if (!store) {
      store = new Map();
      stores.set(key, store);
    }
    return store;
  }

  return {
    createStore: (dbName: string, _storeName: string) => dbName,
    get: async (key: string, storeId?: unknown) => getStoreMap(storeId).get(key),
    set: async (key: string, value: unknown, storeId?: unknown) => {
      getStoreMap(storeId).set(key, value);
    },
    del: async (key: string, storeId?: unknown) => {
      getStoreMap(storeId).delete(key);
    },
    keys: async (storeId?: unknown) => Array.from(getStoreMap(storeId).keys()),
  };
});

import { saveDraft, getDraft, deleteDraft, listDrafts } from './drafts';
import type { ListingInput } from './listings';

const sampleDraft: ListingInput = {
  id: 'draft-1',
  title: 'Old Couch',
  summary: 'Free to a good home',
  price: { amount: '0', currency: 'USD' },
  categories: ['furniture'],
  images: [],
  status: 'active',
  content: 'Comfy but worn.'
};

describe('drafts persistence', () => {
  beforeEach(async () => {
    for (const draft of await listDrafts()) {
      await deleteDraft(draft.id);
    }
  });

  it('saves and retrieves a draft by id', async () => {
    await saveDraft(sampleDraft);
    expect(await getDraft('draft-1')).toEqual(sampleDraft);
  });

  it('returns undefined for a missing draft', async () => {
    expect(await getDraft('does-not-exist')).toBeUndefined();
  });

  it('deletes a draft', async () => {
    await saveDraft(sampleDraft);
    await deleteDraft('draft-1');
    expect(await getDraft('draft-1')).toBeUndefined();
  });

  it('lists all saved drafts', async () => {
    const second: ListingInput = { ...sampleDraft, id: 'draft-2', title: 'Lamp' };
    await saveDraft(sampleDraft);
    await saveDraft(second);
    const all = await listDrafts();
    expect(all.map((d) => d.id).sort()).toEqual(['draft-1', 'draft-2']);
  });

  it('returns an empty array when no drafts exist', async () => {
    expect(await listDrafts()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/drafts.test.ts`
Expected: FAIL with "Failed to resolve import './drafts'"

- [ ] **Step 3: Implement `drafts.ts`**

`src/lib/nostr/drafts.ts`:
```ts
import { get, set, del, keys, createStore } from 'idb-keyval';
import type { ListingInput } from './listings';

const draftsStore = createStore('noteds-drafts', 'drafts');

export async function saveDraft(draft: ListingInput): Promise<void> {
  await set(draft.id, draft, draftsStore);
}

export async function getDraft(id: string): Promise<ListingInput | undefined> {
  return get<ListingInput>(id, draftsStore);
}

export async function deleteDraft(id: string): Promise<void> {
  await del(id, draftsStore);
}

export async function listDrafts(): Promise<ListingInput[]> {
  const allKeys = await keys(draftsStore);
  const drafts: ListingInput[] = [];
  for (const key of allKeys) {
    const draft = await get<ListingInput>(key as string, draftsStore);
    if (draft !== undefined) {
      drafts.push(draft);
    }
  }
  return drafts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/drafts.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nostr/drafts.ts src/lib/nostr/drafts.test.ts
git commit -m "Add idb-keyval-backed draft persistence"
```

---

### Task 8: Feed loading

**Files:**
- Create: `src/lib/nostr/feed.ts`
- Create: `src/lib/nostr/feed.test.ts`

> Note: `subscribeToListings` itself is integration-level (relay network) and is not unit tested here; it's exercised manually via the Feed page (Task 10).

- [ ] **Step 1: Write failing tests for `buildListingFilter`**

`src/lib/nostr/feed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildListingFilter } from './feed';

describe('buildListingFilter', () => {
  it('returns just the kind filter when no options are given', () => {
    expect(buildListingFilter({})).toEqual({ kinds: [30402] });
  });

  it('includes #t when categories are given', () => {
    expect(buildListingFilter({ categories: ['bicycles', 'furniture'] })).toEqual({
      kinds: [30402],
      '#t': ['bicycles', 'furniture']
    });
  });

  it('includes #g when geohashPrefix is given', () => {
    expect(buildListingFilter({ geohashPrefix: '9v6kp' })).toEqual({
      kinds: [30402],
      '#g': ['9v6kp']
    });
  });

  it('includes since when given', () => {
    expect(buildListingFilter({ since: 1000 })).toEqual({ kinds: [30402], since: 1000 });
  });

  it('combines all options together', () => {
    expect(buildListingFilter({ categories: ['bicycles'], geohashPrefix: '9v6kp', since: 1000 })).toEqual({
      kinds: [30402],
      '#t': ['bicycles'],
      '#g': ['9v6kp'],
      since: 1000
    });
  });

  it('omits #t for an empty categories array', () => {
    expect(buildListingFilter({ categories: [] })).toEqual({ kinds: [30402] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/feed.test.ts`
Expected: FAIL with "Failed to resolve import './feed'"

- [ ] **Step 3: Implement `feed.ts`**

`src/lib/nostr/feed.ts`:
```ts
// `Filter` is re-exported from `@nostr/tools/pure` (the `@nostr/tools` JSR package's
// `pure` module includes the core protocol types alongside event helpers).
import type { Filter, NostrEvent } from '@nostr/tools/pure';
import { relayPool } from './signer';

export interface ListingFeedOptions {
  categories?: string[];
  geohashPrefix?: string;
  since?: number;
}

export function buildListingFilter(opts: ListingFeedOptions): Filter {
  const filter: Filter = { kinds: [30402] };

  if (opts.categories?.length) {
    filter['#t'] = opts.categories;
  }
  if (opts.geohashPrefix) {
    filter['#g'] = [opts.geohashPrefix];
  }
  if (opts.since !== undefined) {
    filter.since = opts.since;
  }

  return filter;
}

export function subscribeToListings(
  relays: string[],
  filters: ListingFeedOptions,
  onEvent: (event: NostrEvent) => void
): () => void {
  const filter = buildListingFilter(filters);
  const subscription = relayPool.subscription(relays, filter).subscribe((response) => {
    if (response !== 'EOSE') {
      onEvent(response);
    }
  });

  return () => subscription.unsubscribe();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/feed.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nostr/feed.ts src/lib/nostr/feed.test.ts
git commit -m "Add feed subscription and listing filter builder"
```

---

### Task 9: Root layout, navigation, and AuthGate component

**Files:**
- Modify: `src/routes/+layout.svelte`
- Create: `src/components/AuthGate.svelte`

- [ ] **Step 1: Update `src/routes/+layout.svelte` with navigation**

`src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import '../app.css';
  import { account } from '$lib/nostr/signer';

  let { children } = $props();

  let mobileMenuOpen = $state(false);

  const navLinks = [
    { href: '/', label: 'Feed' },
    { href: '/create', label: 'Create' },
    { href: '/drafts', label: 'Drafts' },
    { href: '/my-listings', label: 'My Listings' },
    { href: '/settings', label: 'Settings' }
  ];

  function truncatePubkey(pubkey: string): string {
    return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }
</script>

<div class="min-h-screen bg-gray-50 text-gray-900">
  <header class="border-b border-gray-200 bg-white">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
      <a href="/" class="text-lg font-bold text-gray-900">noteds</a>

      <nav class="hidden items-center gap-4 sm:flex">
        {#each navLinks as link (link.href)}
          <a href={link.href} class="text-sm font-medium text-gray-700 hover:text-gray-900">{link.label}</a>
        {/each}
      </nav>

      <div class="hidden items-center gap-3 sm:flex">
        {#if $account}
          <span class="text-sm text-gray-600">{$account.npub ? truncatePubkey($account.npub) : 'Connected'}</span>
        {:else}
          <span class="text-sm text-gray-400">Not connected</span>
        {/if}
      </div>

      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 sm:hidden"
        aria-label="Toggle menu"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
      >
        {#if mobileMenuOpen}
          ✕
        {:else}
          ☰
        {/if}
      </button>
    </div>

    {#if mobileMenuOpen}
      <div
        class="border-t border-gray-200 bg-white sm:hidden"
        transition:fly={{ y: -10, duration: 150 }}
      >
        <nav class="flex flex-col gap-1 px-4 py-2" transition:fade={{ duration: 100 }}>
          {#each navLinks as link (link.href)}
            <a
              href={link.href}
              class="rounded-md px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              onclick={closeMobileMenu}
            >
              {link.label}
            </a>
          {/each}
          <div class="border-t border-gray-200 px-2 py-2 text-sm text-gray-500">
            {#if $account}
              {$account.npub ? truncatePubkey($account.npub) : 'Connected'}
            {:else}
              Not connected
            {/if}
          </div>
        </nav>
      </div>
    {/if}
  </header>

  <main class="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
    {@render children()}
  </main>
</div>
```

- [ ] **Step 2: Create `src/components/AuthGate.svelte`**

`src/components/AuthGate.svelte`:
```svelte
<script lang="ts">
  import { account, signer, hasActiveSigner } from '$lib/nostr/signer';

  let { children } = $props();

  let connecting = $state(false);
  let error = $state<string | null>(null);

  let authed = $derived($account !== null || hasActiveSigner());

  async function connect() {
    connecting = true;
    error = null;
    try {
      await signer.getPublicKey();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to connect to a Nostr signer.';
    } finally {
      connecting = false;
    }
  }
</script>

{#if authed}
  {@render children()}
{:else}
  <div class="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-6 text-center">
    <p class="text-sm text-gray-600">Connect a Nostr account to continue.</p>
    <button
      type="button"
      class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      onclick={connect}
      disabled={connecting}
    >
      {connecting ? 'Connecting…' : 'Connect'}
    </button>
    {#if error}
      <p class="text-sm text-red-600">{error}</p>
    {/if}
    <p class="text-xs text-gray-400">
      Set up a passkey identity, or use a NIP-07 extension / NIP-46 bunker, in
      <a href="/settings" class="underline">Settings</a>.
    </p>
  </div>
{/if}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Expected: nav bar renders with links Feed/Create/Drafts/My Listings/Settings; resizing the browser to a mobile width hides the horizontal nav and shows a hamburger button that toggles a mobile menu panel with a fly/fade transition.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.svelte src/components/AuthGate.svelte
git commit -m "Add navigation layout and AuthGate component"
```

---

### Task 10: ListingCard component and Feed page

**Files:**
- Create: `src/components/ListingCard.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Create `src/components/ListingCard.svelte`**

`src/components/ListingCard.svelte`:
```svelte
<script lang="ts">
  import { nip19 } from '@nostr/tools';
  import type { ListingInput } from '$lib/nostr/listings';

  let { listing, pubkey, created_at }: { listing: ListingInput; pubkey: string; created_at: number } = $props();

  let naddr = $derived(
    nip19.naddrEncode({ kind: 30402, pubkey, identifier: listing.id })
  );

  function relativeTime(timestamp: number): string {
    const diffSeconds = Math.floor(Date.now() / 1000) - timestamp;
    if (diffSeconds < 60) return 'just now';
    const minutes = Math.floor(diffSeconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<a
  href="/listing/{naddr}"
  class="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
>
  {#if listing.images.length > 0}
    <img src={listing.images[0]} alt={listing.title} class="h-40 w-full object-cover sm:h-48" />
  {:else}
    <div class="flex h-40 w-full items-center justify-center bg-gray-100 text-gray-400 sm:h-48">No image</div>
  {/if}

  <div class="flex flex-1 flex-col gap-1 p-3">
    <h3 class="text-sm font-semibold text-gray-900 sm:text-base">{listing.title}</h3>
    <p class="text-sm font-medium text-gray-900">{listing.price.amount} {listing.price.currency}</p>
    {#if listing.location}
      <p class="text-xs text-gray-500">{listing.location}</p>
    {/if}

    {#if listing.categories.length > 0}
      <div class="mt-1 flex flex-wrap gap-1">
        {#each listing.categories as category (category)}
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{category}</span>
        {/each}
      </div>
    {/if}

    <p class="mt-auto pt-2 text-xs text-gray-400">{relativeTime(created_at)}</p>
  </div>
</a>
```

- [ ] **Step 2: Update `src/routes/+page.svelte`**

`src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';
  import ListingCard from '$components/ListingCard.svelte';
  import { subscribeToListings } from '$lib/nostr/feed';
  import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { getActiveRelays } from '$lib/nostr/relays';

  interface FeedItem {
    listing: ListingInput;
    pubkey: string;
    created_at: number;
  }

  let items = $state<FeedItem[]>([]);
  let since = $state<number | undefined>(undefined);

  function addItem(item: FeedItem) {
    const existingIndex = items.findIndex((it) => it.listing.id === item.listing.id && it.pubkey === item.pubkey);
    if (existingIndex === -1) {
      items = [...items, item];
    } else if (item.created_at > items[existingIndex].created_at) {
      items = items.map((it, i) => (i === existingIndex ? item : it));
    }
  }

  $effect(() => {
    const unsubscribe = subscribeToListings(getActiveRelays(), { since }, (event) => {
      addItem({
        listing: parseListingEvent(event),
        pubkey: event.pubkey,
        created_at: event.created_at
      });
    });

    return unsubscribe;
  });

  function loadMore() {
    const sevenDays = 7 * 24 * 60 * 60;
    since = (since ?? Math.floor(Date.now() / 1000)) - sevenDays;
  }

  let sortedItems = $derived(
    [...items].sort((a, b) => b.created_at - a.created_at)
  );
</script>

<h1 class="text-2xl font-semibold">Feed</h1>

<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {#each sortedItems as item (item.listing.id + item.pubkey)}
    <div transition:fade={{ duration: 150 }}>
      <ListingCard listing={item.listing} pubkey={item.pubkey} created_at={item.created_at} />
    </div>
  {/each}
</div>

{#if sortedItems.length === 0}
  <p class="mt-4 text-sm text-gray-500">No listings yet.</p>
{/if}

<div class="mt-6 flex justify-center">
  <button
    type="button"
    class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    onclick={loadMore}
  >
    Load more
  </button>
</div>
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Expected: `/` loads without console errors. Relay connections may fail or time out in a sandboxed environment — that's expected and non-fatal.

- [ ] **Step 4: Commit**

```bash
git add src/components/ListingCard.svelte src/routes/+page.svelte
git commit -m "Add ListingCard component and feed page"
```

---

### Task 11: Listing detail page

**Files:**
- Create: `src/routes/listing/[naddr]/+page.ts`
- Create: `src/routes/listing/[naddr]/+page.svelte`

> Note: the "Contact seller" button is wired to a `showContactModal` state flag here; the actual modal is implemented in Task 18.

- [ ] **Step 1: Create `src/routes/listing/[naddr]/+page.ts`**

`src/routes/listing/[naddr]/+page.ts`:
```ts
import { error } from '@sveltejs/kit';
import { nip19 } from '@nostr/tools';
import type { PageLoad } from './$types';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  let decoded;
  try {
    decoded = nip19.decode(params.naddr);
  } catch {
    throw error(404, 'Invalid listing address');
  }

  if (decoded.type !== 'naddr') {
    throw error(404, 'Invalid listing address');
  }

  const { kind, pubkey, identifier } = decoded.data;
  return { kind, pubkey, identifier };
};
```

- [ ] **Step 2: Create `src/routes/listing/[naddr]/+page.svelte`**

`src/routes/listing/[naddr]/+page.svelte`:
```svelte
<script lang="ts">
  import { loadNostrUser, type NostrUser } from '@nostr/gadgets/metadata';
  import { relayPool } from '$lib/nostr/signer';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';

  let { data }: { data: { kind: number; pubkey: string; identifier: string } } = $props();

  let listing = $state<ListingInput | null>(null);
  let seller = $state<NostrUser | null>(null);
  let showContactModal = $state(false);

  function escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderMarkdown(md: string): string {
    let html = escapeHtml(md);

    // Headings
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-semibold mt-4 mb-2">$1</h1>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-3 mb-2">$1</h2>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Bare URLs
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" class="underline text-blue-600" target="_blank" rel="noopener noreferrer">$1</a>');

    // Paragraphs: split on blank lines, convert remaining single newlines to <br>
    html = html
      .split(/\n\s*\n/)
      .map((block) => `<p class="mb-2">${block.replace(/\n/g, '<br>')}</p>`)
      .join('');

    return html;
  }

  $effect(() => {
    let cancelled = false;

    const subscription = relayPool
      .subscription(getActiveRelays(), {
        kinds: [data.kind],
        authors: [data.pubkey],
        '#d': [data.identifier]
      })
      .subscribe((response) => {
        if (response === 'EOSE' || cancelled) return;
        listing = parseListingEvent(response);
      });

    loadNostrUser(data.pubkey).then((user) => {
      if (!cancelled) seller = user;
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  });
</script>

{#if listing}
  <div class="flex flex-col gap-4">
    {#if listing.images.length > 0}
      <div class="flex gap-2 overflow-x-auto sm:grid sm:grid-cols-3 sm:overflow-visible">
        {#each listing.images as image (image)}
          <img src={image} alt={listing.title} class="h-48 w-64 flex-shrink-0 rounded-lg object-cover sm:h-40 sm:w-full" />
        {/each}
      </div>
    {/if}

    <h1 class="text-2xl font-semibold">{listing.title}</h1>
    <p class="text-lg font-medium">{listing.price.amount} {listing.price.currency}</p>

    {#if listing.location}
      <p class="text-sm text-gray-500">{listing.location}</p>
    {/if}

    {#if listing.categories.length > 0}
      <div class="flex flex-wrap gap-1">
        {#each listing.categories as category (category)}
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{category}</span>
        {/each}
      </div>
    {/if}

    <div class="prose prose-sm max-w-none">
      {@html renderMarkdown(listing.content)}
    </div>

    {#if seller}
      <div class="flex items-center gap-2 rounded-lg border border-gray-200 p-3">
        {#if seller.metadata?.picture}
          <img src={seller.metadata.picture} alt="" class="h-8 w-8 rounded-full object-cover" />
        {/if}
        <span class="text-sm text-gray-700">{seller.metadata?.name || seller.metadata?.display_name || 'Seller'}</span>
      </div>
    {/if}

    <button
      type="button"
      class="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      onclick={() => (showContactModal = true)}
    >
      Contact seller
    </button>
    <!-- Contact modal added in Task 18 -->
  </div>
{:else}
  <p class="text-sm text-gray-500">Loading listing…</p>
{/if}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Navigate to `/listing/not-a-valid-naddr` and confirm the SvelteKit 404 error page is shown. Navigating to a real `naddr` requires a published listing on a relay, which isn't available in this sandbox — that's expected; the loading state should render without console errors.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/listing/[naddr]/+page.ts" "src/routes/listing/[naddr]/+page.svelte"
git commit -m "Add listing detail page with markdown rendering"
```

---

### Task 12: ListingForm component and Create page

**Files:**
- Create: `src/components/ListingForm.svelte`
- Create: `src/routes/create/+page.svelte`

- [ ] **Step 1: Create `src/components/ListingForm.svelte`**

`src/components/ListingForm.svelte`:
```svelte
<script lang="ts">
  import { encodeGeohash } from '$lib/nostr/geohash';
  import type { ListingInput } from '$lib/nostr/listings';

  let {
    initial,
    onSubmit
  }: {
    initial?: ListingInput;
    onSubmit: (input: ListingInput, action: 'draft' | 'publish') => void;
  } = $props();

  let title = $state(initial?.title ?? '');
  let summary = $state(initial?.summary ?? '');
  let content = $state(initial?.content ?? '');
  let priceAmount = $state(initial?.price.amount ?? '');
  let priceCurrency = $state(initial?.price.currency ?? 'USD');
  let categories = $state<string[]>(initial?.categories ? [...initial.categories] : []);
  let categoryInput = $state('');
  let location = $state(initial?.location ?? '');
  let geohash = $state(initial?.geohash ?? '');
  let images = $state<string[]>(initial?.images ? [...initial.images] : []);
  let newImageUrl = $state('');
  let showPreview = $state(false);
  let geoError = $state<string | null>(null);

  function escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderMarkdown(md: string): string {
    let html = escapeHtml(md);
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-semibold mt-4 mb-2">$1</h1>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-3 mb-2">$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" class="underline text-blue-600" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html
      .split(/\n\s*\n/)
      .map((block) => `<p class="mb-2">${block.replace(/\n/g, '<br>')}</p>`)
      .join('');
    return html;
  }

  function addCategory() {
    const trimmed = categoryInput.trim();
    if (trimmed && !categories.includes(trimmed)) {
      categories = [...categories, trimmed];
    }
    categoryInput = '';
  }

  function removeCategory(category: string) {
    categories = categories.filter((c) => c !== category);
  }

  function addImageUrl() {
    const trimmed = newImageUrl.trim();
    if (trimmed) {
      images = [...images, trimmed];
    }
    newImageUrl = '';
  }

  function removeImage(url: string) {
    images = images.filter((i) => i !== url);
  }

  function useMyLocation() {
    geoError = null;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      geoError = 'Geolocation is not available in this browser.';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        geohash = encodeGeohash(position.coords.latitude, position.coords.longitude, 6);
      },
      (err) => {
        geoError = err.message || 'Failed to get your location.';
      }
    );
  }

  function buildInput(): ListingInput {
    return {
      id: initial?.id ?? crypto.randomUUID(),
      title,
      summary,
      price: { amount: priceAmount, currency: priceCurrency },
      ...(location ? { location } : {}),
      ...(geohash ? { geohash } : {}),
      categories,
      images,
      status: initial?.status ?? 'active',
      content
    };
  }

  function handleSubmit(action: 'draft' | 'publish') {
    onSubmit(buildInput(), action);
  }
</script>

<form class="flex flex-col gap-4" onsubmit={(e) => e.preventDefault()}>
  <div>
    <label for="title" class="block text-sm font-medium text-gray-700">Title</label>
    <input
      id="title"
      type="text"
      class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
      bind:value={title}
    />
  </div>

  <div>
    <label for="summary" class="block text-sm font-medium text-gray-700">Summary</label>
    <textarea
      id="summary"
      rows="2"
      class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
      bind:value={summary}
    ></textarea>
  </div>

  <div>
    <div class="flex items-center justify-between">
      <label for="content" class="block text-sm font-medium text-gray-700">Description (Markdown)</label>
      <button
        type="button"
        class="text-xs font-medium text-blue-600 hover:underline"
        onclick={() => (showPreview = !showPreview)}
      >
        {showPreview ? 'Edit' : 'Preview'}
      </button>
    </div>
    {#if showPreview}
      <div class="prose prose-sm mt-1 max-w-none rounded-md border border-gray-200 p-3">
        {@html renderMarkdown(content)}
      </div>
    {:else}
      <textarea
        id="content"
        rows="6"
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
        bind:value={content}
      ></textarea>
    {/if}
  </div>

  <div class="flex flex-col gap-2 sm:flex-row">
    <div class="flex-1">
      <label for="price-amount" class="block text-sm font-medium text-gray-700">Price</label>
      <input
        id="price-amount"
        type="number"
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
        bind:value={priceAmount}
      />
    </div>
    <div class="sm:w-32">
      <label for="price-currency" class="block text-sm font-medium text-gray-700">Currency</label>
      <input
        id="price-currency"
        type="text"
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
        bind:value={priceCurrency}
      />
    </div>
  </div>

  <div>
    <span class="block text-sm font-medium text-gray-700">Categories</span>
    <div class="mt-1 flex gap-2">
      <input
        type="text"
        class="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
        bind:value={categoryInput}
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
      />
      <button
        type="button"
        class="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
        onclick={addCategory}
      >
        Add
      </button>
    </div>
    {#if categories.length > 0}
      <div class="mt-2 flex flex-wrap gap-1">
        {#each categories as category (category)}
          <span class="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {category}
            <button type="button" class="text-gray-400 hover:text-gray-700" onclick={() => removeCategory(category)}>×</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <div>
    <label for="location" class="block text-sm font-medium text-gray-700">Location</label>
    <input
      id="location"
      type="text"
      class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
      bind:value={location}
    />
    <div class="mt-1 flex items-center gap-2">
      <button
        type="button"
        class="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
        onclick={useMyLocation}
      >
        Use my location
      </button>
      {#if geohash}
        <span class="text-xs text-gray-500">geohash: {geohash}</span>
      {/if}
    </div>
    {#if geoError}
      <p class="mt-1 text-xs text-red-600">{geoError}</p>
    {/if}
  </div>

  <div>
    <span class="block text-sm font-medium text-gray-700">Images</span>
    <!-- TODO(Task 16): replace with ImageUploader component -->
    <div class="mt-1 flex gap-2">
      <input
        type="text"
        placeholder="https://example.com/image.jpg"
        class="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
        bind:value={newImageUrl}
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addImageUrl())}
      />
      <button
        type="button"
        class="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
        onclick={addImageUrl}
      >
        Add image URL
      </button>
    </div>
    {#if images.length > 0}
      <ul class="mt-2 flex flex-col gap-1">
        {#each images as url (url)}
          <li class="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs">
            <span class="truncate">{url}</span>
            <button type="button" class="text-gray-400 hover:text-gray-700" onclick={() => removeImage(url)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="flex gap-2">
    <button
      type="button"
      class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      onclick={() => handleSubmit('draft')}
    >
      Save Draft
    </button>
    <button
      type="button"
      class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      onclick={() => handleSubmit('publish')}
    >
      Publish
    </button>
  </div>
</form>
```

- [ ] **Step 2: Create `src/routes/create/+page.svelte`**

`src/routes/create/+page.svelte`:
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthGate from '$components/AuthGate.svelte';
  import ListingForm from '$components/ListingForm.svelte';
  import { buildListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { saveDraft, deleteDraft } from '$lib/nostr/drafts';
  import { signer, relayPool } from '$lib/nostr/signer';
  import { getActiveRelays } from '$lib/nostr/relays';

  let error = $state<string | null>(null);

  async function handleSubmit(input: ListingInput, action: 'draft' | 'publish') {
    error = null;
    try {
      if (action === 'draft') {
        await saveDraft(input);
        return;
      }

      const template = buildListingEvent(input, false);
      const event = await signer.signEvent(template);
      await relayPool.publish(getActiveRelays(), event);
      await deleteDraft(input.id);
      await goto('/my-listings');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save listing.';
    }
  }
</script>

<h1 class="text-2xl font-semibold">Create Listing</h1>

<AuthGate>
  <div class="mt-4">
    {#if error}
      <p class="mb-2 text-sm text-red-600">{error}</p>
    {/if}
    <ListingForm onSubmit={handleSubmit} />
  </div>
</AuthGate>
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Navigate to `/create`, fill in the title/summary fields, click "Save Draft". Confirm no console errors are thrown (the draft is saved to `idb-keyval` regardless of signer state). Publishing requires an active signer — confirm the "Publish" button is wired and doesn't throw before the `AuthGate`/signer check.

- [ ] **Step 4: Commit**

```bash
git add src/components/ListingForm.svelte src/routes/create/+page.svelte
git commit -m "Add listing form component and create page"
```

---

### Task 13: Drafts page

**Files:**
- Create: `src/routes/drafts/+page.svelte`
- Modify: `src/routes/create/+page.svelte`

- [ ] **Step 1: Create `src/routes/drafts/+page.svelte`**

`src/routes/drafts/+page.svelte`:
```svelte
<script lang="ts">
  import { listDrafts, deleteDraft } from '$lib/nostr/drafts';
  import type { ListingInput } from '$lib/nostr/listings';

  let drafts = $state<ListingInput[]>([]);

  async function refresh() {
    drafts = await listDrafts();
  }

  $effect(() => {
    refresh();
  });

  async function handleDelete(id: string) {
    await deleteDraft(id);
    await refresh();
  }
</script>

<h1 class="text-2xl font-semibold">Drafts</h1>

{#if drafts.length === 0}
  <p class="mt-4 text-sm text-gray-500">No drafts saved yet.</p>
{:else}
  <ul class="mt-4 flex flex-col gap-3">
    {#each drafts as draft (draft.id)}
      <li class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-gray-900">{draft.title || 'Untitled'}</h2>
          <p class="text-xs text-gray-500">{draft.summary}</p>
          {#if draft.categories.length > 0}
            <div class="mt-1 flex flex-wrap gap-1">
              {#each draft.categories as category (category)}
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{category}</span>
              {/each}
            </div>
          {/if}
        </div>
        <div class="flex gap-2">
          <a
            href="/create?draft={draft.id}"
            class="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit
          </a>
          <button
            type="button"
            class="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
            onclick={() => handleDelete(draft.id)}
          >
            Delete
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 2: Modify `src/routes/create/+page.svelte` to load a draft from the `?draft=` query param**

`src/routes/create/+page.svelte`:
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import AuthGate from '$components/AuthGate.svelte';
  import ListingForm from '$components/ListingForm.svelte';
  import { buildListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { saveDraft, getDraft, deleteDraft } from '$lib/nostr/drafts';
  import { signer, relayPool } from '$lib/nostr/signer';
  import { getActiveRelays } from '$lib/nostr/relays';

  let error = $state<string | null>(null);
  let initial = $state<ListingInput | undefined>(undefined);

  $effect(() => {
    const draftId = page.url.searchParams.get('draft');
    if (draftId) {
      getDraft(draftId).then((draft) => {
        if (draft) initial = draft;
      });
    }
  });

  async function handleSubmit(input: ListingInput, action: 'draft' | 'publish') {
    error = null;
    try {
      if (action === 'draft') {
        await saveDraft(input);
        return;
      }

      const template = buildListingEvent(input, false);
      const event = await signer.signEvent(template);
      await relayPool.publish(getActiveRelays(), event);
      await deleteDraft(input.id);
      await goto('/my-listings');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save listing.';
    }
  }
</script>

<h1 class="text-2xl font-semibold">Create Listing</h1>

<AuthGate>
  <div class="mt-4">
    {#if error}
      <p class="mb-2 text-sm text-red-600">{error}</p>
    {/if}
    {#key initial?.id}
      <ListingForm {initial} onSubmit={handleSubmit} />
    {/key}
  </div>
</AuthGate>
```

> Note: `$app/state`'s `page` export requires `@sveltejs/kit` >= 2.12, which is satisfied by `package.json`'s `^2.64.0` (Task 1).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. From `/create`, fill in a title and click "Save Draft". Visit `/drafts` and confirm the draft is listed with its title/summary. Click "Edit" and confirm `/create?draft=<id>` pre-fills the form with the saved title. Return to `/drafts` and click "Delete", confirming the draft disappears from the list.

- [ ] **Step 4: Commit**

```bash
git add src/routes/drafts/+page.svelte src/routes/create/+page.svelte
git commit -m "Add drafts list page and draft editing"
```

---

### Task 14: My Listings page

**Files:**
- Create: `src/routes/my-listings/+page.svelte`

- [ ] **Step 1: Create `src/routes/my-listings/+page.svelte`**

`src/routes/my-listings/+page.svelte`:
```svelte
<script lang="ts">
  import AuthGate from '$components/AuthGate.svelte';
  import { account, signer, relayPool } from '$lib/nostr/signer';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { buildListingEvent, parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { saveDraft } from '$lib/nostr/drafts';

  interface OwnedListing {
    listing: ListingInput;
    created_at: number;
  }

  let items = $state<OwnedListing[]>([]);
  let error = $state<string | null>(null);

  $effect(() => {
    const pubkey = $account?.pubkey;
    if (!pubkey) {
      items = [];
      return;
    }

    const subscription = relayPool
      .subscription(getActiveRelays(), { kinds: [30402], authors: [pubkey] })
      .subscribe((response) => {
        if (response === 'EOSE') return;
        const listing = parseListingEvent(response);
        const existingIndex = items.findIndex((it) => it.listing.id === listing.id);
        if (existingIndex === -1) {
          items = [...items, { listing, created_at: response.created_at }];
        } else if (response.created_at > items[existingIndex].created_at) {
          items = items.map((it, i) => (i === existingIndex ? { listing, created_at: response.created_at } : it));
        }
      });

    return () => subscription.unsubscribe();
  });

  let sortedItems = $derived([...items].sort((a, b) => b.created_at - a.created_at));

  async function startEditing(listing: ListingInput) {
    // Persist the live listing into idb-keyval drafts so /create?draft=<id> finds it.
    await saveDraft(listing);
  }

  async function markSold(listing: ListingInput) {
    error = null;
    try {
      const updated: ListingInput = { ...listing, status: 'sold' };
      const template = buildListingEvent(updated, false);
      const event = await signer.signEvent(template);
      await relayPool.publish(getActiveRelays(), event);
      const index = items.findIndex((it) => it.listing.id === listing.id);
      if (index !== -1) {
        items = items.map((it, i) => (i === index ? { listing: updated, created_at: event.created_at } : it));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark listing as sold.';
    }
  }
</script>

<h1 class="text-2xl font-semibold">My Listings</h1>

<AuthGate>
  <div class="mt-4">
    {#if error}
      <p class="mb-2 text-sm text-red-600">{error}</p>
    {/if}

    {#if sortedItems.length === 0}
      <p class="text-sm text-gray-500">You haven't published any listings yet.</p>
    {:else}
      <ul class="flex flex-col gap-3">
        {#each sortedItems as item (item.listing.id)}
          <li class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-sm font-semibold text-gray-900">{item.listing.title || 'Untitled'}</h2>
              <p class="text-xs text-gray-500">{item.listing.price.amount} {item.listing.price.currency} · {item.listing.status}</p>
            </div>
            <div class="flex gap-2">
              <a
                href="/create?draft={item.listing.id}"
                class="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onclick={() => startEditing(item.listing)}
              >
                Edit
              </a>
              {#if item.listing.status === 'active'}
                <button
                  type="button"
                  class="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onclick={() => markSold(item.listing)}
                >
                  Mark sold
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</AuthGate>
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. Navigate to `/my-listings` while logged out and confirm the `AuthGate` "Connect" prompt is shown instead of the listings list.

- [ ] **Step 3: Commit**

```bash
git add src/routes/my-listings/+page.svelte
git commit -m "Add my listings page with mark-sold action"
```

---

### Task 15: Search/filter bar with URL sync

**Files:**
- Create: `src/components/SearchBar.svelte`
- Create: `src/lib/nostr/searchParams.ts`
- Create: `src/lib/nostr/searchParams.test.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Write failing tests for `searchParams.ts`**

`src/lib/nostr/searchParams.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseFiltersFromSearchParams, filtersToSearchParams, type ListingFilters } from './searchParams';

describe('parseFiltersFromSearchParams', () => {
  it('returns an empty object for empty params', () => {
    expect(parseFiltersFromSearchParams(new URLSearchParams())).toEqual({});
  });

  it('parses keyword, categories, and geohash prefix', () => {
    const params = new URLSearchParams('q=bike&cat=bicycles,furniture&geo=9v6kp');
    expect(parseFiltersFromSearchParams(params)).toEqual({
      keyword: 'bike',
      categories: ['bicycles', 'furniture'],
      geohashPrefix: '9v6kp'
    });
  });

  it('parses partial filters (only keyword)', () => {
    const params = new URLSearchParams('q=bike');
    expect(parseFiltersFromSearchParams(params)).toEqual({ keyword: 'bike' });
  });

  it('omits empty values', () => {
    const params = new URLSearchParams('q=&cat=&geo=');
    expect(parseFiltersFromSearchParams(params)).toEqual({});
  });
});

describe('filtersToSearchParams', () => {
  it('returns empty params for empty filters', () => {
    expect(filtersToSearchParams({}).toString()).toBe('');
  });

  it('serializes a full filter set', () => {
    const filters: ListingFilters = {
      keyword: 'bike',
      categories: ['bicycles', 'furniture'],
      geohashPrefix: '9v6kp'
    };
    const params = filtersToSearchParams(filters);
    expect(params.get('q')).toBe('bike');
    expect(params.get('cat')).toBe('bicycles,furniture');
    expect(params.get('geo')).toBe('9v6kp');
  });

  it('omits undefined/empty fields', () => {
    const params = filtersToSearchParams({ keyword: 'bike' });
    expect(params.get('q')).toBe('bike');
    expect(params.has('cat')).toBe(false);
    expect(params.has('geo')).toBe(false);
  });
});

describe('round trip', () => {
  it('round-trips empty filters', () => {
    expect(parseFiltersFromSearchParams(filtersToSearchParams({}))).toEqual({});
  });

  it('round-trips a full filter set', () => {
    const filters: ListingFilters = {
      keyword: 'bike',
      categories: ['bicycles', 'furniture'],
      geohashPrefix: '9v6kp'
    };
    expect(parseFiltersFromSearchParams(filtersToSearchParams(filters))).toEqual(filters);
  });

  it('round-trips a partial filter set', () => {
    const filters: ListingFilters = { keyword: 'bike' };
    expect(parseFiltersFromSearchParams(filtersToSearchParams(filters))).toEqual(filters);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/searchParams.test.ts`
Expected: FAIL with "Failed to resolve import './searchParams'"

- [ ] **Step 3: Implement `searchParams.ts`**

`src/lib/nostr/searchParams.ts`:
```ts
export interface ListingFilters {
  keyword?: string;
  categories?: string[];
  geohashPrefix?: string;
}

export function parseFiltersFromSearchParams(params: URLSearchParams): ListingFilters {
  const filters: ListingFilters = {};

  const keyword = params.get('q');
  if (keyword) {
    filters.keyword = keyword;
  }

  const cat = params.get('cat');
  if (cat) {
    const categories = cat.split(',').filter((c) => c.length > 0);
    if (categories.length > 0) {
      filters.categories = categories;
    }
  }

  const geo = params.get('geo');
  if (geo) {
    filters.geohashPrefix = geo;
  }

  return filters;
}

export function filtersToSearchParams(filters: ListingFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.keyword) {
    params.set('q', filters.keyword);
  }
  if (filters.categories?.length) {
    params.set('cat', filters.categories.join(','));
  }
  if (filters.geohashPrefix) {
    params.set('geo', filters.geohashPrefix);
  }

  return params;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/searchParams.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Create `src/components/SearchBar.svelte`**

`src/components/SearchBar.svelte`:
```svelte
<script lang="ts">
  import { encodeGeohash } from '$lib/nostr/geohash';
  import type { ListingFilters } from '$lib/nostr/searchParams';

  let {
    filters,
    onChange
  }: {
    filters: ListingFilters;
    onChange: (filters: ListingFilters) => void;
  } = $props();

  const CATEGORY_OPTIONS = ['Electronics', 'Furniture', 'Vehicles', 'Clothing', 'Free', 'Other'];
  const NEAR_ME_PRECISION_DEFAULT = 5;

  let keywordInput = $state(filters.keyword ?? '');
  let selectedCategories = $state<string[]>(filters.categories ? [...filters.categories] : []);
  let nearMeActive = $state(!!filters.geohashPrefix);
  let precision = $state(NEAR_ME_PRECISION_DEFAULT);
  let geoError = $state<string | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function emitChange(overrides: Partial<ListingFilters> = {}) {
    const next: ListingFilters = {
      ...(keywordInput ? { keyword: keywordInput } : {}),
      ...(selectedCategories.length ? { categories: selectedCategories } : {}),
      ...(filters.geohashPrefix ? { geohashPrefix: filters.geohashPrefix } : {}),
      ...overrides
    };

    // Remove keys explicitly cleared via overrides with undefined values.
    for (const key of Object.keys(overrides) as (keyof ListingFilters)[]) {
      if (overrides[key] === undefined) {
        delete next[key];
      }
    }

    onChange(next);
  }

  function handleKeywordInput(value: string) {
    keywordInput = value;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      emitChange({ keyword: value || undefined });
    }, 300);
  }

  function toggleCategory(category: string) {
    if (selectedCategories.includes(category)) {
      selectedCategories = selectedCategories.filter((c) => c !== category);
    } else {
      selectedCategories = [...selectedCategories, category];
    }
    emitChange({ categories: selectedCategories.length ? selectedCategories : undefined });
  }

  function toggleNearMe() {
    geoError = null;
    if (nearMeActive) {
      nearMeActive = false;
      emitChange({ geohashPrefix: undefined });
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      geoError = 'Geolocation is not available in this browser.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        nearMeActive = true;
        const prefix = encodeGeohash(position.coords.latitude, position.coords.longitude, precision);
        emitChange({ geohashPrefix: prefix });
      },
      (err) => {
        geoError = err.message || 'Failed to get your location.';
      }
    );
  }

  function handlePrecisionChange(value: number) {
    precision = value;
    if (nearMeActive && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const prefix = encodeGeohash(position.coords.latitude, position.coords.longitude, precision);
        emitChange({ geohashPrefix: prefix });
      });
    }
  }
</script>

<div class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:flex-wrap">
  <input
    type="text"
    placeholder="Search listings…"
    class="block w-full rounded-md border-gray-300 shadow-sm sm:max-w-xs sm:text-sm"
    value={keywordInput}
    oninput={(e) => handleKeywordInput(e.currentTarget.value)}
  />

  <div class="flex flex-wrap gap-1">
    {#each CATEGORY_OPTIONS as category (category)}
      <label class="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={selectedCategories.includes(category)}
          onchange={() => toggleCategory(category)}
        />
        {category}
      </label>
    {/each}
  </div>

  <div class="flex items-center gap-2">
    <button
      type="button"
      class="rounded-md border px-3 py-1 text-sm font-medium {nearMeActive ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}"
      onclick={toggleNearMe}
    >
      Near me
    </button>
    {#if nearMeActive}
      <input
        type="range"
        min="3"
        max="7"
        value={precision}
        oninput={(e) => handlePrecisionChange(Number(e.currentTarget.value))}
      />
      <span class="text-xs text-gray-500">precision {precision}</span>
    {/if}
  </div>

  {#if geoError}
    <p class="text-xs text-red-600">{geoError}</p>
  {/if}
</div>
```

- [ ] **Step 6: Update `src/routes/+page.svelte` to wire up search/filters**

`src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ListingCard from '$components/ListingCard.svelte';
  import SearchBar from '$components/SearchBar.svelte';
  import { subscribeToListings } from '$lib/nostr/feed';
  import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { parseFiltersFromSearchParams, filtersToSearchParams, type ListingFilters } from '$lib/nostr/searchParams';

  interface FeedItem {
    listing: ListingInput;
    pubkey: string;
    created_at: number;
  }

  let items = $state<FeedItem[]>([]);
  let since = $state<number | undefined>(undefined);

  let filters = $derived(parseFiltersFromSearchParams(page.url.searchParams));

  function addItem(item: FeedItem) {
    const existingIndex = items.findIndex((it) => it.listing.id === item.listing.id && it.pubkey === item.pubkey);
    if (existingIndex === -1) {
      items = [...items, item];
    } else if (item.created_at > items[existingIndex].created_at) {
      items = items.map((it, i) => (i === existingIndex ? item : it));
    }
  }

  $effect(() => {
    const unsubscribe = subscribeToListings(
      getActiveRelays(),
      { since, categories: filters.categories, geohashPrefix: filters.geohashPrefix },
      (event) => {
        addItem({
          listing: parseListingEvent(event),
          pubkey: event.pubkey,
          created_at: event.created_at
        });
      }
    );

    return unsubscribe;
  });

  function loadMore() {
    const sevenDays = 7 * 24 * 60 * 60;
    since = (since ?? Math.floor(Date.now() / 1000)) - sevenDays;
  }

  function handleFiltersChange(next: ListingFilters) {
    const params = filtersToSearchParams(next);
    const query = params.toString();
    goto(query ? `?${query}` : '?', { replaceState: true, keepFocus: true, noScroll: true });
  }

  let visibleItems = $derived(
    [...items]
      .filter((item) => {
        if (!filters.keyword) return true;
        const needle = filters.keyword.toLowerCase();
        return (
          item.listing.title.toLowerCase().includes(needle) ||
          item.listing.summary.toLowerCase().includes(needle) ||
          item.listing.content.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.created_at - a.created_at)
  );
</script>

<h1 class="text-2xl font-semibold">Feed</h1>

<div class="mt-4">
  <SearchBar {filters} onChange={handleFiltersChange} />
</div>

<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {#each visibleItems as item (item.listing.id + item.pubkey)}
    <div transition:fade={{ duration: 150 }}>
      <ListingCard listing={item.listing} pubkey={item.pubkey} created_at={item.created_at} />
    </div>
  {/each}
</div>

{#if visibleItems.length === 0}
  <p class="mt-4 text-sm text-gray-500">No listings match your filters.</p>
{/if}

<div class="mt-6 flex justify-center">
  <button
    type="button"
    class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    onclick={loadMore}
  >
    Load more
  </button>
</div>
```

- [ ] **Step 7: Commit**

```bash
git add src/components/SearchBar.svelte src/lib/nostr/searchParams.ts src/lib/nostr/searchParams.test.ts src/routes/+page.svelte
git commit -m "Add search/filter bar with URL-synced state"
```

---

### Task 16: ImageUploader (NIP-96/Blossom)

**Files:**
- Create: `src/lib/nostr/blossom.ts`
- Create: `src/lib/nostr/blossom.test.ts`
- Create: `src/components/ImageUploader.svelte`
- Modify: `src/components/ListingForm.svelte`

> Note: `uploadToBlossom` itself is network/signer dependent and is not unit tested here; only the pure `buildBlossomAuthEvent` is covered.

- [ ] **Step 1: Write failing tests for `buildBlossomAuthEvent`**

`src/lib/nostr/blossom.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildBlossomAuthEvent } from './blossom';

describe('buildBlossomAuthEvent', () => {
  it('returns a kind 24242 event with u and method tags', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    expect(event.kind).toBe(24242);
    expect(event.tags).toContainEqual(['u', 'https://blossom.example/upload']);
    expect(event.tags).toContainEqual(['method', 'PUT']);
  });

  it('includes an x tag when sha256Hex is provided', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT', 'deadbeef');
    expect(event.tags).toContainEqual(['x', 'deadbeef']);
  });

  it('omits the x tag when sha256Hex is not provided', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    expect(event.tags.find(([t]) => t === 'x')).toBeUndefined();
  });

  it('sets an expiration tag in the future', () => {
    const before = Math.floor(Date.now() / 1000);
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    const expirationTag = event.tags.find(([t]) => t === 'expiration');
    expect(expirationTag).toBeDefined();
    expect(Number(expirationTag?.[1])).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/blossom.test.ts`
Expected: FAIL with "Failed to resolve import './blossom'"

- [ ] **Step 3: Implement `blossom.ts`**

`src/lib/nostr/blossom.ts`:
```ts
import type { EventTemplate } from '@nostr/tools/pure';
import { signer } from './signer';

export function buildBlossomAuthEvent(url: string, method: string, sha256Hex?: string): EventTemplate {
  return {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    content: 'Upload',
    tags: [
      ['u', url],
      ['method', method],
      ['expiration', String(Math.floor(Date.now() / 1000) + 60)],
      ...(sha256Hex ? [['x', sha256Hex]] : [])
    ]
  };
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadToBlossom(file: File, serverUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256Hex = bufferToHex(digest);

  const uploadUrl = `${serverUrl}/upload`;
  const template = buildBlossomAuthEvent(uploadUrl, 'PUT', sha256Hex);
  const signedEvent = await signer.signEvent(template);
  const authHeader = `Nostr ${btoa(JSON.stringify(signedEvent))}`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'Content-Type': file.type
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Blossom upload failed with status ${response.status}`);
  }

  const json = (await response.json()) as { url?: string };
  if (!json.url) {
    throw new Error('Blossom server response did not include a url.');
  }

  return json.url;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/blossom.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Create `src/components/ImageUploader.svelte`**

`src/components/ImageUploader.svelte`:
```svelte
<script lang="ts">
  import { uploadToBlossom } from '$lib/nostr/blossom';

  const DEFAULT_BLOSSOM_SERVER = 'https://blossom.primal.net';

  let {
    serverUrl,
    onUpload
  }: {
    serverUrl?: string;
    onUpload: (url: string) => void;
  } = $props();

  let uploading = $state(false);
  let error = $state<string | null>(null);

  function resolveServerUrl(): string {
    if (serverUrl) return serverUrl;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('noteds:blossom-server');
      if (stored) return stored;
    }
    return DEFAULT_BLOSSOM_SERVER;
  }

  async function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    error = null;
    uploading = true;
    try {
      const url = await uploadToBlossom(file, resolveServerUrl());
      onUpload(url);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to upload image.';
    } finally {
      uploading = false;
      input.value = '';
    }
  }
</script>

<div class="flex flex-col gap-1">
  <input type="file" accept="image/*" disabled={uploading} onchange={handleFileChange} class="text-sm" />
  {#if uploading}
    <p class="text-xs text-gray-500">Uploading…</p>
  {/if}
  {#if error}
    <p class="text-xs text-red-600">{error}</p>
  {/if}
</div>
```

- [ ] **Step 6: Modify `src/components/ListingForm.svelte` to use `ImageUploader`**

Replace the image-related state, handlers, and markup in `src/components/ListingForm.svelte` as follows.

Add the import at the top of `<script>`:
```ts
  import ImageUploader from './ImageUploader.svelte';
```

Remove the `newImageUrl` state and `addImageUrl` function (no longer needed). Keep `images` state and `removeImage`.

Replace the `<!-- TODO(Task 16): replace with ImageUploader component -->` block:

```svelte
  <div>
    <span class="block text-sm font-medium text-gray-700">Images</span>
    <div class="mt-1">
      <ImageUploader onUpload={(url) => (images = [...images, url])} />
    </div>
    {#if images.length > 0}
      <ul class="mt-2 flex flex-col gap-1">
        {#each images as url (url)}
          <li class="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs">
            <span class="truncate">{url}</span>
            <button type="button" class="text-gray-400 hover:text-gray-700" onclick={() => removeImage(url)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/nostr/blossom.ts src/lib/nostr/blossom.test.ts src/components/ImageUploader.svelte src/components/ListingForm.svelte
git commit -m "Add Blossom image upload and ImageUploader component"
```

---

### Task 17: Settings page

**Files:**
- Create: `src/routes/settings/+page.svelte`

- [ ] **Step 1: Create `src/routes/settings/+page.svelte`**

`src/routes/settings/+page.svelte`:
```svelte
<script lang="ts">
  import { nip19 } from '@nostr/tools';
  import { account, logout, completePasskeySession } from '$lib/nostr/signer';
  import { registerPasskeyIdentity, importPasskeyIdentityFromNsec } from '$lib/nostr/passkeyIdentity';
  import { sanitizeRelayUrl } from '$lib/nostr/security';
  import { getCustomRelays, setCustomRelays, getActiveRelays, DEFAULT_RELAYS } from '$lib/nostr/relays';

  const DEFAULT_BLOSSOM_SERVER = 'https://blossom.primal.net';

  let authError = $state<string | null>(null);
  let registering = $state(false);
  let importing = $state(false);
  let nsecInput = $state('');

  let relays = $state<string[]>(getCustomRelays());
  let newRelayUrl = $state('');
  let relayError = $state<string | null>(null);

  let blossomServer = $state('');

  $effect(() => {
    if (typeof window !== 'undefined') {
      blossomServer = localStorage.getItem('noteds:blossom-server') ?? '';
    }
  });

  function saveBlossomServer() {
    if (typeof window === 'undefined') return;
    if (blossomServer.trim()) {
      localStorage.setItem('noteds:blossom-server', blossomServer.trim());
    } else {
      localStorage.removeItem('noteds:blossom-server');
    }
  }

  async function handleRegister() {
    authError = null;
    registering = true;
    try {
      const { secretKey, pubkey } = await registerPasskeyIdentity();
      await completePasskeySession(secretKey, pubkey);
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to register passkey identity.';
    } finally {
      registering = false;
    }
  }

  async function handleImport() {
    authError = null;
    importing = true;
    try {
      const { secretKey, pubkey } = await importPasskeyIdentityFromNsec(nsecInput);
      await completePasskeySession(secretKey, pubkey);
      nsecInput = '';
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to import identity.';
    } finally {
      importing = false;
    }
  }

  async function handleLogout() {
    authError = null;
    await logout();
  }

  function addRelay() {
    relayError = null;
    const sanitized = sanitizeRelayUrl(newRelayUrl);
    if (!sanitized) {
      relayError = 'Enter a valid ws:// or wss:// relay URL.';
      return;
    }
    if (relays.includes(sanitized)) {
      relayError = 'That relay is already in your list.';
      return;
    }
    relays = [...relays, sanitized];
    setCustomRelays(relays);
    newRelayUrl = '';
  }

  function removeRelay(url: string) {
    relays = relays.filter((r) => r !== url);
    setCustomRelays(relays);
  }
</script>

<h1 class="text-2xl font-semibold">Settings</h1>

<section class="mt-4 rounded-lg border border-gray-200 bg-white p-4">
  <h2 class="text-lg font-semibold">Account</h2>

  {#if $account}
    <div class="mt-2 flex items-center gap-3">
      {#if $account.metadata?.picture}
        <img src={$account.metadata.picture} alt="" class="h-10 w-10 rounded-full object-cover" />
      {/if}
      <div>
        <p class="text-sm font-medium text-gray-900">{$account.metadata?.name || $account.metadata?.display_name || 'Anonymous'}</p>
        <p class="text-xs text-gray-500">{nip19.npubEncode($account.pubkey)}</p>
      </div>
    </div>
    <button
      type="button"
      class="mt-3 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      onclick={handleLogout}
    >
      Logout
    </button>
  {:else}
    <p class="mt-2 text-sm text-gray-500">No account connected on this device.</p>
    <div class="mt-3 flex flex-col gap-3">
      <button
        type="button"
        class="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        onclick={handleRegister}
        disabled={registering}
      >
        {registering ? 'Registering…' : 'Register new passkey identity'}
      </button>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="nsec1… or hex secret key"
          class="block w-full rounded-md border-gray-300 shadow-sm sm:max-w-sm sm:text-sm"
          bind:value={nsecInput}
        />
        <button
          type="button"
          class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          onclick={handleImport}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import from nsec'}
        </button>
      </div>
    </div>
  {/if}

  {#if authError}
    <p class="mt-2 text-sm text-red-600">{authError}</p>
  {/if}
</section>

<section class="mt-4 rounded-lg border border-gray-200 bg-white p-4">
  <h2 class="text-lg font-semibold">Relays</h2>
  <p class="mt-1 text-xs text-gray-500">Active relays (defaults + custom):</p>
  <ul class="mt-1 flex flex-col gap-1 text-sm text-gray-700">
    {#each getActiveRelays() as relay (relay)}
      <li class="flex items-center justify-between rounded-md border border-gray-100 px-2 py-1">
        <span>{relay}</span>
        {#if !DEFAULT_RELAYS.includes(relay)}
          <button type="button" class="text-xs text-red-600 hover:underline" onclick={() => removeRelay(relay)}>Remove</button>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="mt-3 flex flex-col gap-2 sm:flex-row">
    <input
      type="text"
      placeholder="wss://relay.example.com"
      class="block w-full rounded-md border-gray-300 shadow-sm sm:max-w-sm sm:text-sm"
      bind:value={newRelayUrl}
    />
    <button
      type="button"
      class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      onclick={addRelay}
    >
      Add relay
    </button>
  </div>
  {#if relayError}
    <p class="mt-2 text-sm text-red-600">{relayError}</p>
  {/if}
</section>

<section class="mt-4 rounded-lg border border-gray-200 bg-white p-4">
  <h2 class="text-lg font-semibold">Image uploads (Blossom)</h2>
  <label for="blossom-server" class="mt-2 block text-sm font-medium text-gray-700">Server URL</label>
  <input
    id="blossom-server"
    type="text"
    placeholder={DEFAULT_BLOSSOM_SERVER}
    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:max-w-sm sm:text-sm"
    bind:value={blossomServer}
    onblur={saveBlossomServer}
  />
</section>
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. Navigate to `/settings`. Add a relay URL (e.g. `wss://relay.example.com`) and confirm it appears in the active relays list with a "Remove" button. Reload the page and confirm the relay is still listed (check `localStorage['noteds:custom-relays']` in devtools). Click "Remove" and confirm it disappears. Try adding an invalid URL (e.g. `not-a-url`) and confirm an inline error is shown.

- [ ] **Step 3: Commit**

```bash
git add src/routes/settings/+page.svelte
git commit -m "Add settings page for auth, relays, and Blossom server"
```

---

### Task 18: Contact seller via DM

**Files:**
- Create: `src/lib/nostr/dm.ts`
- Create: `src/lib/nostr/dm.test.ts`
- Modify: `src/routes/listing/[naddr]/+page.svelte`

> Note: `sendDirectMessage` itself is signer/network dependent and is not unit tested here; only the pure `buildDirectMessageEvent` is covered.

- [ ] **Step 1: Write failing tests for `buildDirectMessageEvent`**

`src/lib/nostr/dm.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildDirectMessageEvent } from './dm';

describe('buildDirectMessageEvent', () => {
  it('returns a kind 4 event with a p tag for the recipient', () => {
    const event = buildDirectMessageEvent('recipient-pubkey', 'encrypted-content');
    expect(event.kind).toBe(4);
    expect(event.tags).toContainEqual(['p', 'recipient-pubkey']);
    expect(event.content).toBe('encrypted-content');
  });

  it('sets created_at to a recent timestamp', () => {
    const before = Math.floor(Date.now() / 1000);
    const event = buildDirectMessageEvent('recipient-pubkey', 'ciphertext');
    expect(event.created_at).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nostr/dm.test.ts`
Expected: FAIL with "Failed to resolve import './dm'"

- [ ] **Step 3: Implement `dm.ts`**

`src/lib/nostr/dm.ts`:
```ts
import type { EventTemplate } from '@nostr/tools/pure';
import { signer, relayPool } from './signer';
import { getActiveRelays } from './relays';

export function buildDirectMessageEvent(recipientPubkey: string, ciphertext: string): EventTemplate {
  return {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey]],
    content: ciphertext
  };
}

export async function sendDirectMessage(recipientPubkey: string, message: string): Promise<void> {
  const ciphertext = await signer.nip04.encrypt(recipientPubkey, message);
  const template = buildDirectMessageEvent(recipientPubkey, ciphertext);
  const event = await signer.signEvent(template);
  await relayPool.publish(getActiveRelays(), event);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nostr/dm.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Modify `src/routes/listing/[naddr]/+page.svelte` to add a real contact modal**

Add the import at the top of `<script>`:
```ts
  import { fade, scale } from 'svelte/transition';
  import AuthGate from '$components/AuthGate.svelte';
  import { sendDirectMessage } from '$lib/nostr/dm';
```

Add modal-related state alongside the existing `showContactModal` state:
```ts
  let messageText = $state('');
  let sending = $state(false);
  let sendResult = $state<'success' | 'error' | null>(null);
  let sendError = $state<string | null>(null);

  async function handleSend() {
    if (!listing) return;
    sending = true;
    sendResult = null;
    sendError = null;
    try {
      await sendDirectMessage(data.pubkey, messageText);
      sendResult = 'success';
      messageText = '';
      setTimeout(() => (showContactModal = false), 1000);
    } catch (e) {
      sendResult = 'error';
      sendError = e instanceof Error ? e.message : 'Failed to send message.';
    } finally {
      sending = false;
    }
  }
```

Replace the `<!-- Contact modal added in Task 18 -->` placeholder with:

```svelte
    {#if showContactModal}
      <div
        class="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
        transition:fade={{ duration: 100 }}
      >
        <div
          class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg"
          transition:scale={{ duration: 150, start: 0.95 }}
        >
          <h2 class="text-lg font-semibold">Contact seller</h2>
          <AuthGate>
            <textarea
              rows="4"
              class="mt-2 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
              placeholder="Write a message…"
              bind:value={messageText}
            ></textarea>
            {#if sendResult === 'success'}
              <p class="mt-2 text-sm text-green-600">Message sent!</p>
            {:else if sendResult === 'error'}
              <p class="mt-2 text-sm text-red-600">{sendError}</p>
            {/if}
            <div class="mt-3 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onclick={() => (showContactModal = false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                onclick={handleSend}
                disabled={sending || !messageText.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </AuthGate>
        </div>
      </div>
    {/if}
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. Navigate to a listing detail page (or `/listing/<malformed>` to confirm the 404 still works for invalid addresses, and a syntactically valid but unpublished `naddr` to see the loading state). Click "Contact seller" and confirm a modal opens with a fade/scale transition; if logged out, confirm the `AuthGate` "Connect" prompt is shown inside the modal instead of the message form.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nostr/dm.ts src/lib/nostr/dm.test.ts "src/routes/listing/[naddr]/+page.svelte"
git commit -m "Add NIP-04 direct messaging for contacting sellers"
```

---

### Task 19: Repo creation and deployment config

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Verify the production build**

Run: `npm run build`
Expected: build succeeds and produces `build/index.html` (and other static assets under `build/`).

- [ ] **Step 2: Create `.github/workflows/deploy.yml`**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Create the GitHub repo and push**

Run the following commands (not executed by this plan — run manually once the codebase is ready to publish):

```bash
gh repo create imattau/noteds --public --source=. --remote=origin
git push -u origin main
```

- [ ] **Step 4: Enable GitHub Pages via Actions**

In the new repo's Settings > Pages, set "Source" to "GitHub Actions" (this allows the `deploy.yml` workflow above to publish the static site).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deployment workflow"
```

---

## Self-Review Notes

- **Spec section 1 (Overview & Architecture)**: Task 1 scaffolds the SvelteKit + `adapter-static` project with the exact dependency set (`@nostr/tools`, `applesauce-core`/`applesauce-relay`/`applesauce-loaders`, `@nostr/gadgets`, `idb-keyval`, Tailwind 4, Vitest). Mobile-first Tailwind classes, Svelte 5 runes, and Svelte transitions (`fly`/`fade`/`scale`) are used consistently in Tasks 9-18.
- **Spec section 2 (Auth & Identity)**: The passkey/PRF identity module is ported in Task 4 (`passkeyIdentity.ts`, renamed `__notedsPasskey`/`noteds:` storage keys, new PRF salt, added `nip44`). Task 5 ports the unified `signer` (getPublicKey/signEvent/nip04/nip44), `account` store, NIP-07/NIP-46 bunker fallback, and passkey session handling. Task 9 wires `account`/`hasActiveSigner` into the nav and `AuthGate`. Task 17 (Settings) exposes registration, nsec import, and logout.
- **Spec section 3 (Data Model — NIP-99)**: Task 3 provides `encodeGeohash` for the `g` tag. Task 6 provides `buildListingEvent`/`parseListingEvent` for kind 30402/30403 with all NIP-99 tags (`d`, `title`, `summary`, `price`, `location`, `g`, `t`, `image`, `status`). Task 7 provides `idb-keyval`-backed draft persistence mirroring kind 30403.
- **Spec section 4 (Pages & Components)**: `/` (Tasks 9-10, 15), `/listing/[naddr]` (Tasks 11, 18), `/create` (Task 12-13), `/drafts` (Task 13), `/my-listings` (Task 14), `/settings` (Task 17), plus shared components `ListingCard`, `ListingForm`, `SearchBar`, `AuthGate`, `ImageUploader` (relay management is folded into the Settings page rather than a separate `RelayManager` component, per the relay list section of Task 17).
- **Spec section 5 (Search)**: Task 8 provides relay-side `buildListingFilter`/`subscribeToListings` for category (`#t`) and geohash (`#g`) filters. Task 15 adds the `SearchBar` component, URL-synced `ListingFilters` (`searchParams.ts`), debounced client-side keyword filtering, and "near me" geohash-prefix search with adjustable precision.
- **Spec section 6 (Image Upload)**: Task 16 implements NIP-98-style Blossom auth (`buildBlossomAuthEvent`, kind 24242) and `uploadToBlossom`, plus the `ImageUploader` component wired into `ListingForm`, with a configurable server URL (Task 17's Settings page).
- **Spec section 7 (Error Handling)**: `AuthGate` (Task 9) gates all signer-dependent actions across Create, My Listings, and the contact modal. Relay subscriptions in the feed (Tasks 8/10) and listing detail/my-listings pages don't throw on individual relay failures (the `RelayPool` subscription model continues with remaining relays). `ImageUploader` (Task 16) shows inline, non-blocking upload errors.
- **Spec section 8 (Testing)**: Vitest unit tests cover security/utils (Task 2), geohash (Task 3), passkey identity hex/base64url helpers (Task 4), relays (Task 5), listings (Task 6), drafts (Task 7), feed filters (Task 8), search params (Task 15), Blossom auth events (Task 16), and DM event builder (Task 18). DOM/WebAuthn/network-dependent code (signer, passkey ceremonies, `subscribeToListings`, `uploadToBlossom`, `sendDirectMessage`) is explicitly called out as manually verified instead.
- **Spec section 9 (Repo & Deployment)**: Task 19 verifies the static build, adds a GitHub Actions workflow deploying `build/` to GitHub Pages, and documents the `gh repo create imattau/noteds` + push + Pages-source-configuration steps.
- No placeholder or TODO code remains except the explicitly-noted "not unit tested" prose notes (Tasks 4, 5, 8, 16, 18) and the Task 12→16 `<!-- TODO(Task 16): replace with ImageUploader component -->` comment, which is removed by Task 16 Step 6 — all are plan annotations, not lingering code placeholders.
- Naming is consistent throughout: `ListingInput`, `buildListingEvent`, `parseListingEvent`, `getActiveRelays`, `signer`, `account`, `relayPool`, `subscribeToListings`, `encodeGeohash`, `saveDraft`/`getDraft`/`deleteDraft`/`listDrafts`, and `sanitizeRelayUrl`/`filterSecureRelays`/`unique`/`getTagOr`/`getAllTags` are used identically across all referencing tasks.
