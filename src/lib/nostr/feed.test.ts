import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LISTING_BACKFILL_DAYS,
  DEFAULT_LISTING_FEED_LIMIT,
  OLDER_LISTINGS_PAGE_SIZE,
  buildListingFilter,
  fetchListingDeletions,
  fetchOlderListings,
  subscribeToListingDeletions,
  subscribeToListings
} from './feed';
import { relayPool } from './runtime';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildListingFilter', () => {
  it('returns just the kind filter when no options are given', () => {
    expect(buildListingFilter({})).toEqual({ kinds: [30402] });
  });

  it('includes #t when categories are given', () => {
    expect(buildListingFilter({ categories: ['bicycles', 'furniture'] })).toEqual({
      kinds: [30402],
      '#t': ['bicycles', 'furniture']
    });
  });

  it('includes #g when geohashPrefix is given', () => {
    expect(buildListingFilter({ geohashPrefix: '9v6kp' })).toEqual({
      kinds: [30402],
      '#g': ['9v6kp']
    });
  });

  it('includes since when given', () => {
    expect(buildListingFilter({ since: 1000 })).toEqual({ kinds: [30402], since: 1000 });
  });

  it('combines all options together', () => {
    expect(buildListingFilter({ categories: ['bicycles'], geohashPrefix: '9v6kp', since: 1000 })).toEqual({
      kinds: [30402],
      '#t': ['bicycles'],
      '#g': ['9v6kp'],
      since: 1000
    });
  });

  it('omits #t for an empty categories array', () => {
    expect(buildListingFilter({ categories: [] })).toEqual({ kinds: [30402] });
  });

  it('uses a default backfill window when subscribing without since', () => {
    const publish = vi.fn();
    const unsubscribe = vi.fn();
    const subscription = { subscribe: vi.fn(() => ({ unsubscribe })) };
    vi.spyOn(relayPool, 'subscription').mockReturnValue(subscription as any);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    subscribeToListings(['wss://relay.example/'], {}, publish);

    expect(relayPool.subscription).toHaveBeenCalledWith(['wss://relay.example/'], {
      kinds: [30402],
      since: 1_700_000_000 - DEFAULT_LISTING_BACKFILL_DAYS * 24 * 60 * 60,
      limit: DEFAULT_LISTING_FEED_LIMIT
    });
  });

  it('scopes the deletion subscription to listing deletions', () => {
    const onEvent = vi.fn();
    const subscription = { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) };
    vi.spyOn(relayPool, 'subscription').mockReturnValue(subscription as any);

    subscribeToListingDeletions(['wss://relay.example/'], 1000, onEvent);

    expect(relayPool.subscription).toHaveBeenCalledWith(['wss://relay.example/'], {
      kinds: [5],
      '#k': ['30402'],
      since: 1000
    });
  });

  it('pages older listings with until and a page-sized limit', async () => {
    const request = vi.spyOn(relayPool, 'request').mockReturnValue(of() as any);

    await fetchOlderListings(['wss://relay.example/'], { categories: ['Services'] }, 1234);

    expect(request.mock.calls[0][1]).toEqual({
      kinds: [30402],
      '#t': ['Services'],
      until: 1234,
      limit: OLDER_LISTINGS_PAGE_SIZE
    });
  });

  it('checks deletions for paged listings by id and address', async () => {
    const request = vi.spyOn(relayPool, 'request').mockReturnValue(of() as any);

    await fetchListingDeletions(['wss://relay.example/'], ['event-1'], ['30402:pubkey:listing-1']);
    expect(request.mock.calls[0][1]).toEqual([
      { kinds: [5], '#e': ['event-1'] },
      { kinds: [5], '#a': ['30402:pubkey:listing-1'] }
    ]);

    expect(await fetchListingDeletions(['wss://relay.example/'], [], [])).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

