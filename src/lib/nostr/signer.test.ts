import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', () => ({
  del: vi.fn(async () => undefined),
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined)
}));

vi.mock('./metadata', () => ({
  loadNostrUser: vi.fn(async (pubkey: string) => ({
    pubkey,
    npub: `npub:${pubkey}`,
    metadata: null
  }))
}));

describe('signer', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('accepts a minimal NIP-07 signer without requiring bunker bridge methods', async () => {
    const promptSpy = vi.fn();
    vi.stubGlobal('prompt', promptSpy);
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      writable: true,
      value: {
        getPublicKey: vi.fn(async () => 'a'.repeat(64)),
        signEvent: vi.fn(async (event) => ({
          ...event,
          id: 'event-id',
          pubkey: 'a'.repeat(64),
          sig: 'sig'
        }))
      }
    });

    const { hasActiveSigner, signer } = await import('./signer');

    expect(hasActiveSigner()).toBe(true);
    await expect(signer.getPublicKey()).resolves.toBe('a'.repeat(64));
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('replays the current account value to late subscribers', async () => {
    Object.defineProperty(window, 'nostr', {
      configurable: true,
      writable: true,
      value: {
        getPublicKey: vi.fn(async () => 'b'.repeat(64)),
        signEvent: vi.fn(async (event) => ({
          ...event,
          id: 'event-id',
          pubkey: 'b'.repeat(64),
          sig: 'sig'
        }))
      }
    });

    const { account, signer } = await import('./signer');
    await signer.getPublicKey();

    const seen: Array<string | null> = [];
    const unsubscribe = account.subscribe((value) => {
      seen.push(value?.pubkey ?? null);
    });

    unsubscribe();

    expect(seen.at(-1)).toBe('b'.repeat(64));
  });
});
