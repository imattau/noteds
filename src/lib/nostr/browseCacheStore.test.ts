import { beforeEach, describe, expect, it } from 'vitest';
import type { BrowseItem } from './browseCounts';
import type { SellerReview } from './reviews';
import {
  getBrowseItemFromStore,
  loadBrowseCacheStore,
  queryBrowseItemsBySeller,
  queryBrowseReviewsBySeller,
  getSellerReputation,
  queryRelatedBrowseItems,
  cacheBrowseReviews,
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

const review: SellerReview = {
  id: 'review-1',
  sellerPubkey: 'pubkey-1',
  reviewerPubkey: 'reviewer-1',
  rating: 5,
  content: 'Excellent seller',
  anonymous: false,
  created_at: 1_700_000_100,
  eventId: 'review-event-1'
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

  it('stores and queries seller reviews through graph relationships', async () => {
    await cacheBrowseReviews([review, { ...review, id: 'review-2', rating: 3, eventId: 'review-event-2' }]);

    expect(await queryBrowseReviewsBySeller('pubkey-1')).toEqual([
      review,
      { ...review, id: 'review-2', rating: 3, eventId: 'review-event-2' }
    ]);
    expect(await queryBrowseReviewsBySeller('pubkey-2')).toEqual([]);
    expect(await getSellerReputation('pubkey-1')).toEqual({
      count: 2,
      averageRating: 4,
      distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }
    });
  });

  it('ranks related listings by shared graph properties', async () => {
    await upsertBrowseItems([
      item,
      {
        ...item,
        eventId: 'event-2',
        listing: { ...item.listing, id: 'listing-2', title: 'Helmet' }
      },
      {
        ...item,
        eventId: 'event-3',
        listing: { ...item.listing, id: 'listing-3', categories: ['Services'], subcategories: [], geohash: 'zzzzz' }
      }
    ]);

    expect((await queryRelatedBrowseItems(item.pubkey, item.listing.id)).map((entry) => entry.listing.id)).toEqual([
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
