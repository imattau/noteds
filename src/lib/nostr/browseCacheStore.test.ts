import { beforeEach, describe, expect, it } from 'vitest';
import type { BrowseItem } from './browseCounts';
import {
  getBrowseItemFromStore,
  loadBrowseCacheStore,
  queryBrowseItemsBySeller,
  queryBrowseCacheKeys,
  recordBrowseDeletions,
  resetBrowseCacheStoreForTests,
  upsertBrowseItems
} from './browseCacheStore';

const item: BrowseItem = {
  pubkey: 'pubkey-1',
  eventId: 'event-1',
  created_at: 1_700_000_000,
  listing: {
    id: 'listing-1',
    title: 'Bike',
    summary: 'Road bike',
    price: { amount: '100', currency: 'AUD' },
    location: 'Melbourne',
    geohash: 'r1r0p',
    categories: ['For Sale'],
    subcategories: [{ parent: 'For Sale', value: 'Sports & Outdoors' }],
    images: [],
    status: 'active',
    content: 'Details'
  }
};

describe('Polypack browse store', () => {
  beforeEach(() => resetBrowseCacheStoreForTests());

  it('persists listing nodes and shared relation nodes', async () => {
    await upsertBrowseItems([item]);

    expect(await loadBrowseCacheStore()).toMatchObject({ items: [item], deletedEventIds: [] });
    expect(await queryBrowseCacheKeys({ categories: ['For Sale'] })).toEqual(['pubkey-1:listing-1']);
    expect(await queryBrowseCacheKeys({ subcategories: ['For Sale::Sports & Outdoors'] })).toEqual([
      'pubkey-1:listing-1'
    ]);
    expect(await queryBrowseCacheKeys({ geohashPrefix: 'r1r0p12' })).toEqual(['pubkey-1:listing-1']);
  });

  it('intersects category and subcategory relations', async () => {
    await upsertBrowseItems([
      item,
      {
        ...item,
        pubkey: 'pubkey-2',
        eventId: 'event-2',
        listing: { ...item.listing, id: 'listing-2', subcategories: [{ parent: 'For Sale', value: 'Vehicles' }] }
      }
    ]);

    expect(
      await queryBrowseCacheKeys({ categories: ['For Sale'], subcategories: ['For Sale::Sports & Outdoors'] })
    ).toEqual(['pubkey-1:listing-1']);
  });

  it('supports graph-backed seller lookups', async () => {
    await upsertBrowseItems([
      item,
      {
        ...item,
        eventId: 'event-2',
        listing: { ...item.listing, id: 'listing-2', title: 'Helmet' }
      },
      { ...item, pubkey: 'pubkey-2', eventId: 'event-3', listing: { ...item.listing, id: 'listing-3' } }
    ]);

    expect((await queryBrowseItemsBySeller('pubkey-1')).map((entry) => entry.listing.id)).toEqual([
      'listing-1',
      'listing-2'
    ]);
  });

  it('keeps deletion tombstones after removing the listing', async () => {
    await upsertBrowseItems([item]);
    await recordBrowseDeletions(['event-1']);

    expect(await getBrowseItemFromStore(item.pubkey, item.listing.id)).toBeNull();
    expect(await loadBrowseCacheStore()).toMatchObject({ items: [], deletedEventIds: ['event-1'] });
  });

  it('serializes concurrent listing and deletion writes', async () => {
    await Promise.all([upsertBrowseItems([item]), recordBrowseDeletions(['event-1'])]);

    expect(await getBrowseItemFromStore(item.pubkey, item.listing.id)).toBeNull();
    expect(await loadBrowseCacheStore()).toMatchObject({ items: [], deletedEventIds: ['event-1'] });
  });
});
