import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OWNED_LISTINGS_D_TAG,
  OWNED_LISTINGS_KIND,
  decodeOwnedListingIndex,
  encodeOwnedListingIndex,
  loadOwnedListingIds
} from './ownedListings';
import { eventStore, relayPool } from './signer';

const originalVerifyEvent = eventStore.verifyEvent;

afterEach(() => {
  vi.restoreAllMocks();
  eventStore.verifyEvent = originalVerifyEvent;
});

describe('owned listings index', () => {
  it('encodes a deduplicated id list', () => {
    expect(encodeOwnedListingIndex(['one', 'two', 'one', ''])).toBe(
      JSON.stringify({ version: 1, ids: ['one', 'two'] })
    );
  });

  it('decodes an encoded id list', () => {
    const encoded = JSON.stringify({ version: 1, ids: ['one', 'two'] });
    expect(decodeOwnedListingIndex(encoded)).toEqual(['one', 'two']);
  });

  it('returns an empty list for invalid content', () => {
    expect(decodeOwnedListingIndex('not-json')).toEqual([]);
    expect(decodeOwnedListingIndex(JSON.stringify({ version: 2, ids: ['one'] }))).toEqual([]);
  });
});

describe('loadOwnedListingIds', () => {
  const pubkey = 'a'.repeat(64);

  function buildEvent(createdAt: number, ids: string[]) {
    return {
      kind: OWNED_LISTINGS_KIND,
      content: encodeOwnedListingIndex(ids),
      created_at: createdAt,
      pubkey,
      id: `${createdAt}`.padStart(64, '0'),
      sig: 'c'.repeat(128),
      tags: [['d', OWNED_LISTINGS_D_TAG]]
    };
  }

  it('uses the newest event when multiple versions are returned', async () => {
    eventStore.verifyEvent = () => true;
    const older = buildEvent(100, ['one']);
    const newer = buildEvent(200, ['one', 'two']);

    vi.spyOn(relayPool, 'request').mockReturnValue(of(older, newer) as any);

    expect(await loadOwnedListingIds(pubkey)).toEqual(['one', 'two']);
  });

  it('picks the newest event regardless of arrival order', async () => {
    eventStore.verifyEvent = () => true;
    const older = buildEvent(101, ['one']);
    const newer = buildEvent(201, ['one', 'two', 'three']);

    vi.spyOn(relayPool, 'request').mockReturnValue(of(newer, older) as any);

    expect(await loadOwnedListingIds(pubkey)).toEqual(['one', 'two', 'three']);
  });
});
