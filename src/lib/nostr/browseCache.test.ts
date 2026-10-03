import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowseItem } from './browseCounts';

const storeItems = new Map<string, BrowseItem>();
const deletionKeys = new Set<string>();

function getItemKey(item: BrowseItem): string {
  return `${item.pubkey}:${item.listing.id}`;
}

function itemDeletionKey(item: BrowseItem): string {
  return `${item.pubkey}:${item.eventId}`;
}

function resetStore() {
  storeItems.clear();
  deletionKeys.clear();
}

vi.mock('./browseCacheStore', () => ({
  loadBrowseCacheStore: async () => ({
    items: Array.from(storeItems.values()).filter((item) => !deletionKeys.has(itemDeletionKey(item))),
    deletionKeys: Array.from(deletionKeys)
  }),
  loadBrowseDeletionKeys: async () => Array.from(deletionKeys),
  loadLegacyBrowseCacheStore: async () => ({ items: [], deletedEventIds: [] }),
  pruneBrowseCacheStore: async () => undefined,
  upsertBrowseItems: async (items: BrowseItem[]) => {
    for (const item of items) {
      storeItems.set(getItemKey(item), item);
      deletionKeys.delete(itemDeletionKey(item));
    }
  },
  recordBrowseDeletions: async (keys: string[]) => {
    for (const key of keys) {
      deletionKeys.add(key);
      for (const [itemKey, item] of storeItems.entries()) {
        if (itemDeletionKey(item) === key) {
          storeItems.delete(itemKey);
        }
      }
    }
  },
  getBrowseItemFromStore: async (pubkey: string, listingId: string) => {
    const item = storeItems.get(`${pubkey}:${listingId}`);
    if (!item || deletionKeys.has(itemDeletionKey(item))) {
      return null;
    }
    return item;
  },
  queryBrowseCacheKeys: async () => Array.from(storeItems.keys()),
  queryHybridBrowseItems: async (filters: { categories?: string[]; geohashPrefix?: string }) => Array.from(storeItems.values())
    .filter((item) => !deletionKeys.has(itemDeletionKey(item)))
    .filter((item) => !filters.categories?.length || filters.categories.every((category) => item.listing.categories.includes(category)))
    .filter((item) => !filters.geohashPrefix || filters.geohashPrefix.startsWith(item.listing.geohash ?? '')),
  resetBrowseCacheStoreForTests: () => resetStore()
}));

import {
  cacheBrowseDeletions,
  cacheBrowseItem,
  cacheBrowseItems,
  flushBrowseCacheSnapshot,
  loadBrowseCache,
  loadBrowseCacheSnapshot,
  mergeBrowseCaches,
  normalizeDeletionKeys,
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
    expect(await loadBrowseCache()).toEqual({ items: [], deletionKeys: [], updatedAt: 0 });
  });

  it('stores and reloads browse items', async () => {
    await cacheBrowseItem(sampleItem);
    const cache = await loadBrowseCache();

    expect(cache.items).toEqual([sampleItem]);
    expect(cache.deletionKeys).toEqual([]);
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

  it('removes cached items when their author deletes them', async () => {
    await cacheBrowseItem(sampleItem);
    await cacheBrowseDeletions([`${sampleItem.pubkey}:event-1`]);

    const cache = await loadBrowseCache();
    expect(cache.items).toEqual([]);
    expect(cache.deletionKeys).toContain(`${sampleItem.pubkey}:event-1`);
  });

  it('ignores deletions of a listing issued by someone else', async () => {
    await cacheBrowseItem(sampleItem);
    await cacheBrowseDeletions(['someone-else:event-1']);

    expect((await loadBrowseCache()).items).toEqual([sampleItem]);
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
      { items: [sampleItem], deletionKeys: ['author:old-event'], updatedAt: 1 },
      {
        items: [{ ...sampleItem, created_at: sampleItem.created_at + 20 }],
        deletionKeys: ['author:new-event'],
        updatedAt: 2
      }
    );

    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].created_at).toBe(sampleItem.created_at + 20);
    expect(merged.deletionKeys).toEqual(expect.arrayContaining(['author:new-event', 'author:old-event']));
    expect(merged.updatedAt).toBe(2);
  });

  it('keeps the newest deletion keys when over the cap', () => {
    const keys = Array.from({ length: 600 }, (_, index) => `author:event-${index}`);
    const normalized = normalizeDeletionKeys(keys);
    expect(normalized).toHaveLength(500);
    expect(normalized[0]).toBe('author:event-100');
    expect(normalized.at(-1)).toBe('author:event-599');
  });

  it('drops bare event ids recorded before deletions carried their author', () => {
    expect(normalizeDeletionKeys(['legacy-event-id', 'author:event-1'])).toEqual(['author:event-1']);
  });

  it('keeps the newest version when a batch repeats a listing', async () => {
    await cacheBrowseItems([
      { ...sampleItem, eventId: 'newer', created_at: sampleItem.created_at + 10 },
      { ...sampleItem, eventId: 'older' }
    ]);
    const cache = await loadBrowseCache();
    expect(cache.items.map((entry) => entry.eventId)).toEqual(['newer']);
  });
});
