import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import * as idbkv from 'idb-keyval';
import { readable } from 'svelte/store';
import { loadNostrUser, type NostrUser } from './metadata';
import type { Event, EventTemplate } from 'nostr-tools';
import { bytesToHex, buildPasskeySignerShim, hexToBytes, isPasskeyShim } from './passkeyIdentity';
import type { PasskeySignerShim } from './passkeyIdentity';

export const relayPool = new RelayPool();
export const eventStore = new EventStore();

let passkeySignerShim: PasskeySignerShim | null = null;
let restoredPasskeyPubkey: string | null = null;
let nostrBridgePromise: Promise<void> | null = null;
let setAccount: (pubkey: string | null) => Promise<void> = async () => {};

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
      script.src = 'https://unpkg.com/window.nostr.js/dist/window.nostr.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load window.nostr.js'));
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
    } catch (error) {
      sessionStorage.removeItem('noteds:passkey_session_nsec');
      sessionStorage.removeItem('noteds:passkey_session_pubkey');
      console.error('Failed to restore passkey session', error);
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

async function setAccountFromPubkey(pubkey: string | null): Promise<void> {
  if (!pubkey) {
    if (typeof window !== 'undefined') {
      await idbkv.del('noteds:loggedin');
    }
    return;
  }

  const acct = await loadNostrUser(pubkey);
  if (typeof window !== 'undefined') {
    await idbkv.set('noteds:loggedin', acct);
  }
  accountValue = acct;
  subscribers.forEach((subscriber) => subscriber(accountValue));
}

let accountValue: NostrUser | null = null;
const subscribers = new Set<(value: NostrUser | null) => void>();

export const account = readable<NostrUser | null>(null, (set) => {
  subscribers.add(set);
  setAccount = async (pubkey: string | null) => {
    if (!pubkey) {
      accountValue = null;
      if (typeof window !== 'undefined') {
        await idbkv.del('noteds:loggedin');
      }
      subscribers.forEach((subscriber) => subscriber(accountValue));
      return;
    }

    const acct = await loadNostrUser(pubkey);
    accountValue = acct;
    if (typeof window !== 'undefined') {
      await idbkv.set('noteds:loggedin', acct);
    }
    subscribers.forEach((subscriber) => subscriber(accountValue));
  };

  if (restoredPasskeyPubkey) {
    void setAccount(restoredPasskeyPubkey);
    restoredPasskeyPubkey = null;
  } else if (typeof window !== 'undefined') {
    setTimeout(async () => {
      const data = await idbkv.get<NostrUser>('noteds:loggedin');
      if (data) {
        accountValue = data;
        subscribers.forEach((subscriber) => subscriber(accountValue));
      }
    }, 700);
  }

  return () => {
    subscribers.delete(set);
  };
});

export const signer = {
  getPublicKey: async (): Promise<string> => {
    const pubkey = await withSigner((nostr) => nostr.getPublicKey());
    void setAccount(pubkey);
    return pubkey;
  },
  signEvent: async (event: EventTemplate): Promise<Event> => {
    const signed = await withSigner((nostr) => nostr.signEvent(event));
    void setAccount(signed.pubkey);
    return signed;
  },
  nip04: {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip04.encrypt(pubkey, plaintext)),
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip04.decrypt(pubkey, ciphertext))
  },
  nip44: {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip44.encrypt(pubkey, plaintext)),
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> =>
      withSigner((nostr) => nostr.nip44.decrypt(pubkey, ciphertext))
  }
};

export async function completePasskeySession(secretKey: Uint8Array, pubkey: string): Promise<void> {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('noteds:passkey_session_nsec', bytesToHex(secretKey));
  sessionStorage.setItem('noteds:passkey_session_pubkey', pubkey);
  passkeySignerShim = buildPasskeySignerShim(secretKey);
  (window as any).nostr = passkeySignerShim;
  await setAccount(pubkey);
}

export async function logout(): Promise<void> {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('noteds:passkey_session_nsec');
  sessionStorage.removeItem('noteds:passkey_session_pubkey');
  passkeySignerShim = null;
  if (isPasskeyShim((window as any).nostr)) {
    delete (window as any).nostr;
  }
  await setAccount(null);
}
