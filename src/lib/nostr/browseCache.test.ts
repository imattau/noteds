import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowseItem } from './browseCounts';

const storeItems = new Map<string, BrowseItem>();
const deletedEventIds = new Set<string>();

function getItemKey(item: BrowseItem): string {
  return `${item.pubkey}:${item.listing.id}`;
}

function resetStore() {
  storeItems.clear();
  deletedEventIds.clear();
}

vi.mock('./browseCacheStore', () => ({
  loadBrowseCacheStore: async () => ({
    items: Array.from(storeItems.values()).filter((item) => !deletedEventIds.has(item.eventId)),
    deletedEventIds: Array.from(deletedEventIds)
  }),
  loadLegacyBrowseCacheStore: async () => ({ items: [], deletedEventIds: [] }),
  upsertBrowseItems: async (items: BrowseItem[]) => {
    for (const item of items) {
      storeItems.set(getItemKey(item), item);
      deletedEventIds.delete(item.eventId);
    }
  },
  recordBrowseDeletions: async (eventIds: string[]) => {
    for (const eventId of eventIds) {
      deletedEventIds.add(eventId);
      for (const [itemKey, item] of storeItems.entries()) {
        if (item.eventId === eventId) {
          storeItems.delete(itemKey);
        }
      }
    }
  },
  getBrowseItemFromStore: async (pubkey: string, listingId: string) => {
    const item = storeItems.get(`${pubkey}:${listingId}`);
    if (!item || deletedEventIds.has(item.eventId)) {
      return null;
    }
    return item;
  },
  queryBrowseCacheKeys: async () => Array.from(storeItems.keys()),
  resetBrowseCacheStoreForTests: () => resetStore()
}));

import {
  cacheBrowseDeletions,
  cacheBrowseItem,
  flushBrowseCacheSnapshot,
  loadBrowseCache,
  loadBrowseCacheSnapshot,
  mergeBrowseCaches,
  queryBrowseCache,
  resetBrowseCacheMemoryForTests
} from './browseCache';
import type { ListingInput } from './listings';

const sampleListing: ListingInput = {
  id: 'listing-1',
  title: 'Vintage Bike',
  summary: 'Well loved road bike',
  price: { amount: '100', currency: 'USD' },
  location: 'Melbourne',
  geohash: 'r1r0p',
  categories: ['For Sale'],
  subcategories: [{ parent: 'For Sale', value: 'Sports & Outdoors' }],
  images: [],
  status: 'active',
  content: 'Full details here'
};

const sampleItem: BrowseItem = {
  listing: sampleListing,
  pubkey: 'npub1test',
  created_at: 1_700_000_000,
  eventId: 'event-1'
};

describe('browse cache', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    resetBrowseCacheMemoryForTests();
  });

  it('starts empty when nothing has been cached', async () => {
    expect(await loadBrowseCache()).toEqual({ items: [], deletedEventIds: [], updatedAt: 0 });
  });

  it('stores and reloads browse items', async () => {
    await cacheBrowseItem(sampleItem);
    const cache = await loadBrowseCache();

    expect(cache.items).toEqual([sampleItem]);
    expect(cache.deletedEventIds).toEqual([]);
    expect(cache.updatedAt).toBeGreaterThan(0);

    flushBrowseCacheSnapshot();
    expect(loadBrowseCacheSnapshot().items).toEqual([sampleItem]);
  });

  it('deduplicates items by pubkey and listing id', async () => {
    await cacheBrowseItem(sampleItem);
    await cacheBrowseItem({ ...sampleItem, created_at: sampleItem.created_at + 10 });

    const cache = await loadBrowseCache();
    expect(cache.items).toHaveLength(1);
    expect(cache.items[0].created_at).toBe(sampleItem.created_at + 10);
  });

  it('removes cached items when deletions are recorded', async () => {
    await cacheBrowseItem(sampleItem);
    await cacheBrowseDeletions(['event-1']);

    const cache = await loadBrowseCache();
    expect(cache.items).toEqual([]);
    expect(cache.deletedEventIds).toContain('event-1');
  });

  it('queries browse items by indexed category and geohash', async () => {
    await cacheBrowseItem(sampleItem);
    await cacheBrowseItem({
      ...sampleItem,
      listing: { ...sampleItem.listing, id: 'listing-2', geohash: 'r1r0z', categories: ['Services'] },
      pubkey: 'npub1other',
      eventId: 'event-2'
    });

    const categoryResult = await queryBrowseCache({ categories: ['For Sale'] });
    expect(categoryResult.items).toHaveLength(1);
    expect(categoryResult.items[0].listing.id).toBe('listing-1');

    const geohashResult = await queryBrowseCache({ geohashPrefix: 'r1r0p' });
    expect(geohashResult.items).toHaveLength(1);
    expect(geohashResult.items[0].listing.id).toBe('listing-1');

    const preciseGeohashResult = await queryBrowseCache({ geohashPrefix: 'r1r0p12' });
    expect(preciseGeohashResult.items).toHaveLength(1);
    expect(preciseGeohashResult.items[0].listing.id).toBe('listing-1');
  });

  it('merges local snapshot and indexeddb cache', () => {
    const merged = mergeBrowseCaches(
      { items: [sampleItem], deletedEventIds: ['old-event'], updatedAt: 1 },
      {
        items: [{ ...sampleItem, created_at: sampleItem.created_at + 20 }],
        deletedEventIds: ['new-event'],
        updatedAt: 2
      }
    );

    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].created_at).toBe(sampleItem.created_at + 20);
    expect(merged.deletedEventIds).toEqual(expect.arrayContaining(['new-event', 'old-event']));
    expect(merged.updatedAt).toBe(2);
  });
});
