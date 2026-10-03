import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowseItem } from './browseCounts';

const cachedSellerItems: BrowseItem[] = [];

vi.mock('./browseCache', () => ({ cacheBrowseItems: vi.fn(async () => undefined) }));
vi.mock('./browseCacheStore', () => ({ queryBrowseItemsBySeller: vi.fn(async () => cachedSellerItems) }));

import { fetchAuthoredListings, loadAuthoredListings } from './authoredListings';
import { relayPool } from './runtime';

const pubkey = 'b'.repeat(64);

afterEach(() => {
  vi.restoreAllMocks();
  cachedSellerItems.length = 0;
});

describe('authored listings', () => {
  it('only the display loader falls back to locally cached listings', async () => {
    cachedSellerItems.push({
      pubkey,
      eventId: 'cached-event',
      created_at: 100,
      listing: {
        id: 'cached-listing',
        title: 'Cached',
        summary: '',
        price: { amount: '1', currency: 'AUD' },
        categories: [],
        images: [],
        status: 'active',
        content: ''
      }
    });
    vi.spyOn(relayPool, 'request').mockReturnValue(of() as any);

    // My Listings rebuilds the owned index from this, so it must be relay-only.
    expect(await fetchAuthoredListings(pubkey)).toEqual([]);
    expect((await loadAuthoredListings(pubkey)).map((item) => item.listing.id)).toEqual(['cached-listing']);
  });
});
