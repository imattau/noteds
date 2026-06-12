import { finalizeEvent, generateSecretKey, getPublicKey, nip04, nip19, nip44, type Event, type EventTemplate } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const STORAGE_KEY = 'noteds:passkey-identity';

export interface PasskeyIdentityRecord {
  version: 1;
  credentialId: string;
  encryptedNsec: string;
  pubkey: string;
}

const PRF_SALT = new Uint8Array([
  84, 12, 201, 9, 144, 233, 71, 188, 5, 99, 142, 60, 219, 31, 7, 250, 128, 33, 176, 92, 14, 201, 88, 47,
  163, 200, 19, 102, 58, 240, 6, 177
]);

export { bytesToHex, hexToBytes };

function toBase64(binary: string): string {
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function fromBase64(base64: string): string {
  if (typeof atob === 'function') {
    return atob(base64);
  }
  return Buffer.from(base64, 'base64').toString('binary');
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return toBase64(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = fromBase64(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function isValidRecord(value: unknown): value is PasskeyIdentityRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.credentialId === 'string' &&
    typeof record.encryptedNsec === 'string' &&
    typeof record.pubkey === 'string'
  );
}

function readStoredRecord(): PasskeyIdentityRecord | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasStoredPasskeyIdentity(): boolean {
  return readStoredRecord() !== null;
}

export function getStoredPasskeyPubkey(): string | null {
  return readStoredRecord()?.pubkey ?? null;
}

export function clearPasskeyIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function isPRFSupported(): Promise<boolean> {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && typeof navigator?.credentials?.create === 'function';
}

async function normalizePRFKey(prfResult: ArrayBuffer): Promise<Uint8Array> {
  if (prfResult.byteLength === 32) {
    return new Uint8Array(prfResult);
  }
  const digest = await crypto.subtle.digest('SHA-256', prfResult);
  return new Uint8Array(digest);
}

function extractPRFResult(credential: PublicKeyCredential): ArrayBuffer | undefined {
  const extensions = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  return extensions.prf?.results?.first;
}

function parseImportedSecretKey(input: string): Uint8Array {
  const cleaned = input.trim();
  if (!cleaned) {
    throw new Error('Please provide a Nostr secret key.');
  }
  if (/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    return hexToBytes(cleaned);
  }
  const decoded = nip19.decode(cleaned);
  if (decoded.type === 'nsec') {
    return decoded.data;
  }
  throw new Error('Please provide a valid nsec or 64-character hex secret key.');
}

async function enrollPasskeyCredential(): Promise<{ credentialId: string; prfKey: Uint8Array }> {
  if (!(await isPRFSupported())) {
    throw new Error('Passkeys are not supported in this browser.');
  }

  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Noteds', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'noteds-identity',
        displayName: 'Noteds Identity'
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      extensions: { prf: { eval: { first: PRF_SALT } } }
    }
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey registration was cancelled.');
  }

  let prfResult = extractPRFResult(credential);
  if (prfResult === undefined) {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: credential.rawId, type: 'public-key' }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: PRF_SALT } } }
      }
    })) as PublicKeyCredential | null;

    if (assertion) {
      prfResult = extractPRFResult(assertion);
    }
  }

  if (prfResult === undefined) {
    throw new Error('This device does not support passkey-based encryption (PRF extension required).');
  }

  return {
    credentialId: arrayBufferToBase64Url(credential.rawId),
    prfKey: await normalizePRFKey(prfResult)
  };
}

async function persistPasskeyIdentity(
  secretKey: Uint8Array,
  credentialId: string,
  prfKey: Uint8Array
): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const pubkey = getPublicKey(secretKey);
  const encryptedNsec = nip44.encrypt(bytesToHex(secretKey), prfKey);
  const record: PasskeyIdentityRecord = { version: 1, credentialId, encryptedNsec, pubkey };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return { secretKey, pubkey };
}

export async function registerPasskeyIdentity(): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const { credentialId, prfKey } = await enrollPasskeyCredential();
  const secretKey = generateSecretKey();
  return persistPasskeyIdentity(secretKey, credentialId, prfKey);
}

export async function importPasskeyIdentityFromNsec(nsec: string): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const secretKey = parseImportedSecretKey(nsec);
  const { credentialId, prfKey } = await enrollPasskeyCredential();
  return persistPasskeyIdentity(secretKey, credentialId, prfKey);
}

export async function unlockPasskeyIdentity(): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const record = readStoredRecord();
  if (!record) {
    throw new Error('No passkey identity found on this device.');
  }

  const credentialIdBytes = base64UrlToArrayBuffer(record.credentialId);
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: credentialIdBytes, type: 'public-key' }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: PRF_SALT } } }
    }
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey unlock was cancelled.');
  }

  const prfResult = extractPRFResult(credential);
  if (prfResult === undefined) {
    throw new Error('Passkey unlock failed: PRF extension result unavailable.');
  }

  const prfKey = await normalizePRFKey(prfResult);
  const nsecHex = nip44.decrypt(record.encryptedNsec, prfKey);
  const secretKey = hexToBytes(nsecHex);
  return { secretKey, pubkey: record.pubkey };
}

export interface PasskeySignerShim {
  getPublicKey: () => Promise<string>;
  signEvent: (template: EventTemplate) => Promise<Event>;
  nip04: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
  __notedsPasskey: true;
}

export function buildPasskeySignerShim(secretKey: Uint8Array): PasskeySignerShim {
  return {
    getPublicKey: async () => getPublicKey(secretKey),
    signEvent: async (template: EventTemplate) => finalizeEvent(template, secretKey),
    nip04: {
      encrypt: async (pubkey: string, plaintext: string) => nip04.encrypt(secretKey, pubkey, plaintext),
      decrypt: async (pubkey: string, ciphertext: string) => nip04.decrypt(secretKey, pubkey, ciphertext)
    },
    nip44: {
      encrypt: async (pubkey: string, plaintext: string) => nip44.encrypt(secretKey, pubkey, plaintext),
      decrypt: async (pubkey: string, ciphertext: string) => nip44.decrypt(secretKey, pubkey, ciphertext)
    },
    __notedsPasskey: true
  };
}

export function isPasskeyShim(nostr: unknown): boolean {
  return !!nostr && typeof nostr === 'object' && (nostr as { __notedsPasskey?: unknown }).__notedsPasskey === true;
}
