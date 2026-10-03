import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowseItem } from './browseCounts';
import type { SellerReview } from './reviews';
import {
  getBrowseItemFromStore,
  loadBrowseCacheStore,
  loadBrowseDeletionKeys,
  queryBrowseItemsBySeller,
  queryBrowseReviewsBySeller,
  getSellerReputation,
  queryRelatedBrowseItems,
  queryHybridBrowseItems,
  pruneBrowseCacheStore,
  cacheBrowseReviews,
  queryBrowseCacheKeys,
  recordBrowseDeletions,
  resetBrowseCacheStoreForTests,
  setBrowseEmbeddingProvider,
  upsertBrowseItems
} from './browseCacheStore';
import { FeatureHashEmbedding } from '@0xx0lostcause0xx0/polypack';

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

    expect(await loadBrowseCacheStore()).toMatchObject({ items: [item], deletionKeys: [] });
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

  it('retrieves and ranks listings with stored semantic vectors', async () => {
    await upsertBrowseItems([
      item,
      {
        ...item,
        eventId: 'event-2',
        listing: { ...item.listing, id: 'listing-2', title: 'Wooden dining table', summary: 'Solid oak table' }
      }
    ]);

    const results = await queryHybridBrowseItems({ keyword: 'road bike' });
    expect(results.map((entry) => entry.listing.id)).toEqual(['listing-1', 'listing-2']);
    expect(results[0].semanticScore).toBeGreaterThan(0);
    expect(results[0].keywordScore).toBe(1);
  });

  it('prunes old listings while preserving the newest graph records', async () => {
    await upsertBrowseItems([
      { ...item, created_at: 100, eventId: 'old-event', listing: { ...item.listing, id: 'old-listing' } },
      { ...item, created_at: 200, eventId: 'mid-event', listing: { ...item.listing, id: 'mid-listing' } },
      { ...item, created_at: 300, eventId: 'new-event', listing: { ...item.listing, id: 'new-listing' } }
    ]);
    await pruneBrowseCacheStore(2, 500);

    expect((await loadBrowseCacheStore()).items.map((entry) => entry.listing.id)).toEqual([
      'mid-listing',
      'new-listing'
    ]);
    expect(await getBrowseItemFromStore(item.pubkey, 'old-listing')).toBeNull();
  });

  it('keeps deletion tombstones after removing the listing', async () => {
    await upsertBrowseItems([item]);
    await recordBrowseDeletions(['pubkey-1:event-1']);

    expect(await getBrowseItemFromStore(item.pubkey, item.listing.id)).toBeNull();
    expect(await loadBrowseCacheStore()).toMatchObject({ items: [], deletionKeys: ['pubkey-1:event-1'] });
  });

  it('serializes concurrent listing and deletion writes', async () => {
    await Promise.all([upsertBrowseItems([item]), recordBrowseDeletions(['pubkey-1:event-1'])]);

    expect(await getBrowseItemFromStore(item.pubkey, item.listing.id)).toBeNull();
    expect(await loadBrowseCacheStore()).toMatchObject({ items: [], deletionKeys: ['pubkey-1:event-1'] });
  });

  it('ignores deletions issued by someone other than the listing author', async () => {
    await upsertBrowseItems([item]);
    await recordBrowseDeletions(['attacker:event-1', 'event-1']);

    expect(await getBrowseItemFromStore(item.pubkey, item.listing.id)).toMatchObject({ eventId: 'event-1' });
    expect(await loadBrowseCacheStore()).toMatchObject({ items: [item], deletionKeys: ['attacker:event-1'] });
  });

  it('skips re-embedding listings whose event is already stored', async () => {
    const baseline = new FeatureHashEmbedding({ dimensions: 384 });
    const embed = vi.fn((text: string) => baseline.embed(text));
    setBrowseEmbeddingProvider({ version: 'feature-hash-384-v1', dimensions: 384, embed });

    await upsertBrowseItems([item]);
    await upsertBrowseItems([item]);
    expect(embed).toHaveBeenCalledTimes(1);

    await upsertBrowseItems([{ ...item, created_at: item.created_at - 10, eventId: 'older-event' }]);
    expect(embed).toHaveBeenCalledTimes(1);
    expect((await getBrowseItemFromStore(item.pubkey, item.listing.id))?.eventId).toBe('event-1');

    const updated = { ...item, created_at: item.created_at + 10, eventId: 'newer-event' };
    await upsertBrowseItems([updated]);
    expect(embed).toHaveBeenCalledTimes(2);
    expect((await getBrowseItemFromStore(item.pubkey, item.listing.id))?.eventId).toBe('newer-event');
  });

  it('removes only the listing matching a deleted event id', async () => {
    await upsertBrowseItems([
      item,
      { ...item, eventId: 'event-2', listing: { ...item.listing, id: 'listing-2' } }
    ]);
    await recordBrowseDeletions(['pubkey-1:event-2', 'pubkey-1:unknown-event']);

    expect((await loadBrowseCacheStore()).items.map((entry) => entry.listing.id)).toEqual(['listing-1']);
    expect((await loadBrowseCacheStore()).deletionKeys.sort()).toEqual(['pubkey-1:event-2', 'pubkey-1:unknown-event']);
  });

  it('sweeps shared nodes orphaned by pruning', async () => {
    await upsertBrowseItems([
      { ...item, created_at: 100, eventId: 'old-event', listing: { ...item.listing, id: 'old-listing', categories: ['Services'] } },
      { ...item, created_at: 300, eventId: 'new-event', listing: { ...item.listing, id: 'new-listing' } }
    ]);
    await pruneBrowseCacheStore(1, 500);

    expect(await queryBrowseCacheKeys({ categories: ['Services'] })).toEqual([]);
    expect(await queryBrowseCacheKeys({ categories: ['For Sale'] })).toEqual(['pubkey-1:new-listing']);
  });

  it('ranks with reputations for many sellers', async () => {
    await upsertBrowseItems([
      item,
      { ...item, pubkey: 'pubkey-2', eventId: 'event-2', listing: { ...item.listing, id: 'listing-2' } }
    ]);
    await cacheBrowseReviews([
      { ...review, rating: 1 },
      { ...review, id: 'review-2', sellerPubkey: 'pubkey-2', rating: 5, eventId: 'review-event-2' }
    ]);

    const results = await queryHybridBrowseItems({});
    expect(Object.fromEntries(results.map((entry) => [entry.pubkey, entry.reputationScore]))).toEqual({
      'pubkey-1': 0.2,
      'pubkey-2': 1
    });
  });

  it('loads deletion tombstones oldest first', async () => {
    await recordBrowseDeletions(['author:event-a']);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await recordBrowseDeletions(['author:event-b']);

    expect(await loadBrowseDeletionKeys()).toEqual(['author:event-a', 'author:event-b']);
  });

  it('ignores stored vectors from a different embedding provider', async () => {
    await upsertBrowseItems([item]);
    const baseline = new FeatureHashEmbedding({ dimensions: 384 });
    setBrowseEmbeddingProvider({ version: 'other-model', dimensions: 384, embed: (text) => baseline.embed(text) });
    try {
      const [result] = await queryHybridBrowseItems({ keyword: 'road bike' });
      expect(result.semanticScore).toBe(0);
      expect(result.keywordScore).toBe(1);
    } finally {
      setBrowseEmbeddingProvider({ version: 'feature-hash-384-v1', dimensions: 384, embed: (text) => baseline.embed(text) });
    }
  });
});
