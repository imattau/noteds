import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = new Map<string, Map<string, unknown>>();

vi.mock('idb-keyval', () => {
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
    createStore: (dbName: string, storeName: string) => `${dbName}:${storeName}`,
    get: async (key: string, storeId?: unknown) => getStoreMap(storeId).get(key),
    set: async (key: string, value: unknown, storeId?: unknown) => {
      getStoreMap(storeId).set(key, value);
    },
    getMany: async (keys: string[], storeId?: unknown) => keys.map((key) => getStoreMap(storeId).get(key)),
    setMany: async (entries: [string, unknown][], storeId?: unknown) => {
      const store = getStoreMap(storeId);
      for (const [key, value] of entries) {
        store.set(key, value);
      }
    },
    del: async (key: string, storeId?: unknown) => {
      getStoreMap(storeId).delete(key);
    },
    keys: async (storeId?: unknown) => Array.from(getStoreMap(storeId).keys())
  };
});

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
import type { BrowseItem } from './browseCounts';
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
    stores.clear();
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
