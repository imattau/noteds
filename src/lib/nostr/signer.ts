import * as idbkv from 'idb-keyval';
import { readable } from 'svelte/store';
import { loadNostrUser, type NostrUser } from './metadata';
import type { Event, EventTemplate } from 'nostr-tools';
import { bytesToHex, buildPasskeySignerShim, hexToBytes, isPasskeyShim } from './passkeyIdentity';
import type { PasskeySignerShim } from './passkeyIdentity';

interface NostrSignerLike {
  getPublicKey: () => Promise<string>;
  signEvent: (event: EventTemplate) => Promise<Event>;
  nip04?: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
  nip44?: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
  __notedsPasskey?: true;
}

interface NostrSignerAdapter extends NostrSignerLike {
  nip04: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
}

const PASSKEY_SESSION_NSEC_KEY = 'noteds:passkey_session_nsec';
const PASSKEY_SESSION_PUBKEY_KEY = 'noteds:passkey_session_pubkey';

let passkeySignerShim: PasskeySignerShim | null = null;
let restoredPasskeyPubkey: string | null = null;
let hydratedPreferencesPubkey: string | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function hasActivePasskeySession(): boolean {
  if (passkeySignerShim) {
    return true;
  }
  if (!isBrowser()) {
    return false;
  }
  return (
    sessionStorage.getItem(PASSKEY_SESSION_NSEC_KEY) !== null &&
    sessionStorage.getItem(PASSKEY_SESSION_PUBKEY_KEY) !== null
  );
}

function isNip07SignerLike(nostr: unknown): nostr is NostrSignerLike {
  if (!nostr || typeof nostr !== 'object') return false;
  const candidate = nostr as Partial<NostrSignerLike>;
  return typeof candidate.getPublicKey === 'function' && typeof candidate.signEvent === 'function';
}

async function getNostrSigner(): Promise<NostrSignerLike | null> {
  if (passkeySignerShim) {
    return passkeySignerShim;
  }
  if (!isBrowser()) {
    return null;
  }

  // Poll for window.nostr to be initialized by browser extensions or window.nostr.js wrapper
  for (let i = 0; i < 30; i++) {
    const nostr = (window as Window & { nostr?: unknown }).nostr;
    if (isNip07SignerLike(nostr)) {
      return nostr;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const nostr = (window as Window & { nostr?: unknown }).nostr;
  return isNip07SignerLike(nostr) ? nostr : null;
}

export function hasActiveSigner(): boolean {
  if (passkeySignerShim) return true;
  if (!isBrowser()) return false;
  const nostr = (window as Window & { nostr?: unknown }).nostr;
  return isNip07SignerLike(nostr);
}

async function updateAccountFromPubkey(pubkey: string | null): Promise<void> {
  if (!pubkey) {
    accountValue = null;
    if (isBrowser()) {
      await idbkv.del('noteds:loggedin');
    }
    subscribers.forEach((subscriber) => subscriber(accountValue));
    return;
  }

  try {
    const acct = await loadNostrUser(pubkey);
    accountValue = acct;
    if (isBrowser()) {
      await idbkv.set('noteds:loggedin', acct);
    }
    subscribers.forEach((subscriber) => subscriber(accountValue));
  } catch (error) {
    console.error('Failed to load user metadata', error);
  }

  if (isBrowser() && hydratedPreferencesPubkey !== pubkey) {
    void import('./preferences').then(async ({ hydratePreferencesFromNostr }) => {
      await hydratePreferencesFromNostr(pubkey);
      hydratedPreferencesPubkey = pubkey;
    });
  }
}

async function withSigner<T>(fn: (nostr: NostrSignerAdapter) => Promise<T>): Promise<T> {
  const nostr = await getNostrSigner();
  if (!nostr) {
    throw new Error('No Nostr signer is available.');
  }

  if (!('nip04' in nostr) || !('nip44' in nostr)) {
    return fn({
      ...nostr,
      nip04: {
        encrypt: async (pubkey: string, plaintext: string) => {
          if (nostr.nip04?.encrypt) return nostr.nip04.encrypt(pubkey, plaintext);
          throw new Error('This Nostr signer does not support NIP-04 encryption.');
        },
        decrypt: async (pubkey: string, ciphertext: string) => {
          if (nostr.nip04?.decrypt) return nostr.nip04.decrypt(pubkey, ciphertext);
          throw new Error('This Nostr signer does not support NIP-04 encryption.');
        }
      },
      nip44: {
        encrypt: async (pubkey: string, plaintext: string) => {
          if (nostr.nip44?.encrypt) return nostr.nip44.encrypt(pubkey, plaintext);
          throw new Error('This Nostr signer does not support NIP-44 encryption.');
        },
        decrypt: async (pubkey: string, ciphertext: string) => {
          if (nostr.nip44?.decrypt) return nostr.nip44.decrypt(pubkey, ciphertext);
          throw new Error('This Nostr signer does not support NIP-44 encryption.');
        }
      }
    } as unknown as NostrSignerAdapter);
  }
  return fn(nostr as NostrSignerAdapter);
}

let accountValue: NostrUser | null = null;
const subscribers = new Set<(value: NostrUser | null) => void>();

export const account = readable<NostrUser | null>(null, (set) => {
  subscribers.add(set);
  set(accountValue);

  if (restoredPasskeyPubkey) {
    void updateAccountFromPubkey(restoredPasskeyPubkey);
    restoredPasskeyPubkey = null;
  } else if (isBrowser()) {
    void idbkv
      .get<NostrUser>('noteds:loggedin')
      .then((data) => {
        if (data) {
          accountValue = data;
          subscribers.forEach((subscriber) => subscriber(accountValue));
          void updateAccountFromPubkey(data.pubkey);
        }
      })
      .catch((err) => {
        console.error('Failed to read loggedin state from IndexedDB', err);
      });
  }

  return () => {
    subscribers.delete(set);
  };
});

export const signer = {
  getPublicKey: async (): Promise<string> => {
    const pubkey = await withSigner((nostr) => nostr.getPublicKey());
    void updateAccountFromPubkey(pubkey);
    return pubkey;
  },
  signEvent: async (event: EventTemplate): Promise<Event> => {
    const signed = await withSigner((nostr) => nostr.signEvent(event));
    void updateAccountFromPubkey(signed.pubkey);
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
  if (!isBrowser()) return;
  sessionStorage.setItem(PASSKEY_SESSION_NSEC_KEY, bytesToHex(secretKey));
  sessionStorage.setItem(PASSKEY_SESSION_PUBKEY_KEY, pubkey);
  passkeySignerShim = buildPasskeySignerShim(secretKey);
  (window as Window & { nostr?: unknown }).nostr = passkeySignerShim;
  await updateAccountFromPubkey(pubkey);
}

export async function logout(): Promise<void> {
  if (!isBrowser()) return;
  sessionStorage.removeItem(PASSKEY_SESSION_NSEC_KEY);
  sessionStorage.removeItem(PASSKEY_SESSION_PUBKEY_KEY);
  passkeySignerShim = null;
  hydratedPreferencesPubkey = null;
  if (isPasskeyShim((window as Window & { nostr?: unknown }).nostr)) {
    delete (window as Window & { nostr?: unknown }).nostr;
  }
  await updateAccountFromPubkey(null);
}

// Restore stored passkey session if available
if (isBrowser()) {
  const sessionNsec = sessionStorage.getItem(PASSKEY_SESSION_NSEC_KEY);
  if (sessionNsec) {
    try {
      const secretKey = hexToBytes(sessionNsec);
      passkeySignerShim = buildPasskeySignerShim(secretKey);
      (window as Window & { nostr?: unknown }).nostr = passkeySignerShim;
      restoredPasskeyPubkey = sessionStorage.getItem(PASSKEY_SESSION_PUBKEY_KEY);
    } catch (error) {
      sessionStorage.removeItem(PASSKEY_SESSION_NSEC_KEY);
      sessionStorage.removeItem(PASSKEY_SESSION_PUBKEY_KEY);
      console.error('Failed to restore passkey session', error);
    }
  }
}
