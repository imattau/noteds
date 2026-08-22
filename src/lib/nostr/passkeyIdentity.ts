/**
 * Passkey-based Nostr identity management.
 *
 * Thin wrapper around `nostr-passkey` that configures app-specific defaults
 * (storage key, RP name) and re-exports the types / helpers used elsewhere
 * in this codebase.
 */
import {
  clearPasskeyIdentity,
  importPasskeyIdentityFromNsec,
  registerPasskeyIdentity,
  unlockPasskeyIdentity as unlockPasskeyIdentityFromLibrary
} from 'nostr-passkey';

export type {
  PasskeyIdentityOptions,
  PasskeyIdentityRecord,
  PasskeyIdentityRecordV1,
  PasskeyIdentityRecordV2,
  PasskeyIdentityResult,
  PasskeySignerShim,
  PasskeyStorage
} from 'nostr-passkey';

export {
  buildPasskeySignerShim,
  bytesToHex,
  exportPasskeyIdentityAsNsec,
  getStoredPasskeyPubkey,
  hasStoredPasskeyIdentity,
  hexToBytes,
  isPasskeyShim,
  isPRFSupported,
  readStoredPasskeyIdentity
} from 'nostr-passkey';

/** App-wide options passed to every nostr-passkey call. */
const APP_OPTIONS = {
  storageKey: 'noteds:passkey-identity',
  rpName: 'Noteds'
} as const;

export function clearPasskeyIdentityStore(): void {
  clearPasskeyIdentity(APP_OPTIONS);
}

// Re-export helpers that callers use directly, bound with app options.

export async function registerPasskeyIdentityForApp() {
  return registerPasskeyIdentity(APP_OPTIONS);
}

export async function importPasskeyIdentityFromNsecForApp(nsec: string) {
  return importPasskeyIdentityFromNsec(nsec, APP_OPTIONS);
}

export async function unlockPasskeyIdentityForApp() {
  return unlockPasskeyIdentityFromLibrary(undefined, APP_OPTIONS);
}

/** Backwards-compatible app-configured name used by the signer layer. */
export async function unlockPasskeyIdentity() {
  return unlockPasskeyIdentityForApp();
}
