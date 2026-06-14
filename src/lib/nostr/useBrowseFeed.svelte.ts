import { onDestroy, untrack } from 'svelte';
import {
  cacheBrowseDeletions,
  cacheBrowseItems,
  loadBrowseCacheSnapshot,
  mergeBrowseCaches,
  primeBrowseCacheMemory,
  queryBrowseCache
} from '$lib/nostr/browseCache';
import { DEFAULT_LISTING_BACKFILL_DAYS, subscribeToListings } from '$lib/nostr/feed';
import { getDeletedEventIds } from '$lib/nostr/deletions';
import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
import { getActiveRelays } from '$lib/nostr/relays';
import { relayPool } from '$lib/nostr/runtime';
import type { ListingFilters } from '$lib/nostr/searchParams';

interface FeedItem {
  listing: ListingInput;
  pubkey: string;
  created_at: number;
  eventId: string;
}

export function useBrowseFeed(options: {
  filters: () => ListingFilters;
  since: () => number | undefined;
  categories: () => string[] | undefined;
  categoryScope?: () => string | undefined;
}) {
  let items = $state<FeedItem[]>([]);
  let deletedEventIds = $state<string[]>([]);
  let browseCacheUpdatedAt = 0;

  $effect(() => {
    const browseCache = loadBrowseCacheSnapshot();
    untrack(() => {
      if (items.length === 0) {
        items = browseCache.items;
      }
      if (deletedEventIds.length === 0) {
        deletedEventIds = browseCache.deletedEventIds;
      }
    });
    browseCacheUpdatedAt = browseCache.updatedAt;
  });

  const FEED_FLUSH_DELAY_MS = 150;
  let pendingItems: FeedItem[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingItems() {
    flushTimer = null;
    if (pendingItems.length === 0) return;
    const batch = pendingItems;
    pendingItems = [];

    const map = new Map<string, FeedItem>();
    for (const item of items) {
      map.set(`${item.listing.id}:${item.pubkey}`, item);
    }
    for (const item of batch) {
      if (deletedEventIds.includes(item.eventId)) continue;
      const key = `${item.listing.id}:${item.pubkey}`;
      const existing = map.get(key);
      if (!existing || item.created_at > existing.created_at) {
        map.set(key, item);
      }
    }
    items = Array.from(map.values());

    void cacheBrowseItems(batch);
  }

  function addItem(item: FeedItem) {
    pendingItems.push(item);
    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingItems, FEED_FLUSH_DELAY_MS);
    }
  }

  onDestroy(() => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  });

  let browseQueryToken = 0;
  $effect(() => {
    const token = ++browseQueryToken;
    const filters = options.filters();
    const since = options.since();
    const categoryScope = options.categoryScope?.();
    const current = untrack(() => ({
      items,
      deletedEventIds,
      updatedAt: browseCacheUpdatedAt
    }));

    void queryBrowseCache(
      {
        since,
        keyword: filters.keyword,
        location: filters.location,
        categories: filters.categories,
        subcategories: filters.subcategories,
        geohashPrefix: filters.geohashPrefix
      },
      categoryScope
    ).then((cache) => {
      if (token !== browseQueryToken) return;
      const merged = mergeBrowseCaches(current, cache);
      items = merged.items;
      deletedEventIds = merged.deletedEventIds;
      primeBrowseCacheMemory(merged);
    });

    return undefined;
  });

  $effect(() => {
    const since = options.since();
    const filters = options.filters();
    const categories = options.categories();
    const unsubscribe = subscribeToListings(
      getActiveRelays(),
      { since, categories, geohashPrefix: filters.geohashPrefix },
      (event) => {
        addItem({
          listing: parseListingEvent(event),
          pubkey: event.pubkey,
          created_at: event.created_at,
          eventId: event.id
        });
      }
    );
    return unsubscribe;
  });

  $effect(() => {
    const since = options.since();
    const deletionSince =
      since ?? Math.floor(Date.now() / 1000) - DEFAULT_LISTING_BACKFILL_DAYS * 24 * 60 * 60;
    const unsubscribe = relayPool
      .subscription(getActiveRelays(), { kinds: [5], since: deletionSince })
      .subscribe((response: any) => {
        if (response === 'EOSE') return;
        const deleted = getDeletedEventIds(response);
        if (deleted.length === 0) return;
        deletedEventIds = [...new Set([...deletedEventIds, ...deleted])];
        items = items.filter((item) => !deleted.includes(item.eventId));
        void cacheBrowseDeletions(deleted);
      });
    return () => unsubscribe.unsubscribe();
  });

  return {
    get items() { return items; },
    get deletedEventIds() { return deletedEventIds; }
  };
}
