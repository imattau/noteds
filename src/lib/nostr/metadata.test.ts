import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNostrUser, resetProfileCacheForTests } from './metadata';
import { eventStore, relayPool } from './runtime';

const originalVerifyEvent = eventStore.verifyEvent;
let nextPubkey = 0;

// The event store is shared across tests, so each test uses fresh pubkeys.
function freshPubkey(): string {
  nextPubkey += 1;
  return nextPubkey.toString(16).padStart(64, '0');
}

function profileEvent(pubkey: string, name: string, createdAt = 100) {
  return {
    kind: 0,
    content: JSON.stringify({ name }),
    created_at: createdAt,
    pubkey,
    id: `${pubkey.slice(-8)}${createdAt}`.padStart(64, '0'),
    sig: 'c'.repeat(128),
    tags: []
  };
}

beforeEach(() => {
  localStorage.clear();
  resetProfileCacheForTests();
  eventStore.verifyEvent = () => true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  eventStore.verifyEvent = originalVerifyEvent;
});

describe('loadNostrUser', () => {
  it('batches nearby lookups into one request and shares in-flight ones', async () => {
    const [alice, bob] = [freshPubkey(), freshPubkey()];
    const request = vi
      .spyOn(relayPool, 'request')
      .mockReturnValue(of(profileEvent(alice, 'Alice'), profileEvent(bob, 'Bob')) as any);

    const users = await Promise.all([loadNostrUser(alice), loadNostrUser(bob), loadNostrUser(alice)]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toEqual({ kinds: [0], authors: [alice, bob] });
    expect(users.map((user) => user.metadata?.name)).toEqual(['Alice', 'Bob', 'Alice']);
  });

  it('serves a cached profile without a request, then refreshes it once stale', async () => {
    const carol = freshPubkey();
    const request = vi.spyOn(relayPool, 'request').mockReturnValue(of(profileEvent(carol, 'Carol')) as any);
    await loadNostrUser(carol);
    expect(request).toHaveBeenCalledTimes(1);

    expect((await loadNostrUser(carol)).metadata?.name).toBe('Carol');
    expect(request).toHaveBeenCalledTimes(1);

    request.mockReturnValue(of(profileEvent(carol, 'Carol 2', 200)) as any);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
    // Stale: still answered from cache immediately, refreshed in the background.
    expect((await loadNostrUser(carol)).metadata?.name).toBe('Carol');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await vi.waitFor(async () => expect((await loadNostrUser(carol)).metadata?.name).toBe('Carol 2'));
  });

  it('does not re-request a pubkey without a profile until the retry interval passes', async () => {
    const dave = freshPubkey();
    const request = vi.spyOn(relayPool, 'request').mockReturnValue(of() as any);

    expect((await loadNostrUser(dave)).metadata).toBeNull();
    expect((await loadNostrUser(dave)).metadata).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60 * 1000);
    await loadNostrUser(dave);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('migrates legacy per-profile keys into the bounded cache', async () => {
    const erin = freshPubkey();
    localStorage.setItem(
      `noteds:profile:${erin}`,
      JSON.stringify({ pubkey: erin, npub: 'npub-erin', metadata: { name: 'Erin' } })
    );
    const request = vi.spyOn(relayPool, 'request').mockReturnValue(of(profileEvent(erin, 'Erin')) as any);

    expect((await loadNostrUser(erin)).metadata?.name).toBe('Erin');
    expect(localStorage.getItem(`noteds:profile:${erin}`)).toBeNull();
    // Migrated entries are stale, so they refresh in the background.
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });
});
