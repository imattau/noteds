import { onDestroy, untrack } from 'svelte';
import {
  cacheBrowseDeletions,
  cacheBrowseItems,
  loadBrowseCacheSnapshot,
  mergeBrowseCaches,
  normalizeDeletedEventIds,
  primeBrowseCacheMemory,
  queryBrowseCache
} from '$lib/nostr/browseCache';
import { DEFAULT_LISTING_BACKFILL_DAYS, subscribeToListingDeletions, subscribeToListings } from '$lib/nostr/feed';
import { getDeletedEventIds } from '$lib/nostr/deletions';
import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
import { getActiveRelays } from '$lib/nostr/relays';
import type { ListingFilters } from '$lib/nostr/searchParams';

interface FeedItem {
  listing: ListingInput;
  pubkey: string;
  created_at: number;
  eventId: string;
}

/** Upper bound on listings held in memory; the newest are kept. */
const MAX_FEED_ITEMS = 1000;

/** Feed items are always kept newest first, so pages don't need to re-sort. */
function newestFirst(list: FeedItem[]): FeedItem[] {
  return list.sort((a, b) => b.created_at - a.created_at).slice(0, MAX_FEED_ITEMS);
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

    const deleted = new Set(deletedEventIds);
    const map = new Map<string, FeedItem>();
    for (const item of items) {
      map.set(`${item.listing.id}:${item.pubkey}`, item);
    }
    for (const item of batch) {
      if (deleted.has(item.eventId)) continue;
      const key = `${item.listing.id}:${item.pubkey}`;
      const existing = map.get(key);
      if (!existing || item.created_at > existing.created_at) {
        map.set(key, item);
      }
    }
    items = newestFirst(Array.from(map.values()));

    void cacheBrowseItems(batch);
  }

  function addItem(item: FeedItem) {
    pendingItems.push(item);
    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingItems, FEED_FLUSH_DELAY_MS);
    }
  }

  let pendingDeletions = new Set<string>();
  let deletionFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingDeletions() {
    deletionFlushTimer = null;
    const known = new Set(deletedEventIds);
    const fresh = Array.from(pendingDeletions).filter((eventId) => !known.has(eventId));
    pendingDeletions = new Set();
    if (fresh.length === 0) return;

    const freshSet = new Set(fresh);
    deletedEventIds = normalizeDeletedEventIds([...deletedEventIds, ...fresh]);
    items = items.filter((item) => !freshSet.has(item.eventId));
    void cacheBrowseDeletions(fresh);
  }

  function addDeletions(eventIds: string[]) {
    for (const eventId of eventIds) pendingDeletions.add(eventId);
    if (!deletionFlushTimer) {
      deletionFlushTimer = setTimeout(flushPendingDeletions, FEED_FLUSH_DELAY_MS);
    }
  }

  onDestroy(() => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (deletionFlushTimer) {
      clearTimeout(deletionFlushTimer);
      deletionFlushTimer = null;
    }
  });

  // The layout warms the semantic model at startup; a search before that
  // finishes loads it on demand. Flipping this re-runs the cache query so
  // results pick up the better ranking.
  let semanticReady = $state(false);

  let browseQueryToken = 0;
  $effect(() => {
    const token = ++browseQueryToken;
    const filters = options.filters();
    if (filters.keyword?.trim() && !semanticReady) {
      void import('$lib/nostr/browserEmbedding')
        .then(({ ensureBrowserSemanticSearch }) => ensureBrowserSemanticSearch())
        .then((ready) => {
          if (ready) semanticReady = true;
        });
    }
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
      items = newestFirst(merged.items);
      deletedEventIds = merged.deletedEventIds;
      primeBrowseCacheMemory(merged);
    });

    return undefined;
  });

  // Only these inputs change the relay filter. Deriving them as primitives
  // keeps keyword/location edits from tearing down and refetching the feed.
  const feedGeohashPrefix = $derived(options.filters().geohashPrefix);
  const feedCategoriesKey = $derived(JSON.stringify(options.categories() ?? []));

  $effect(() => {
    const since = options.since();
    const geohashPrefix = feedGeohashPrefix;
    const categories = JSON.parse(feedCategoriesKey) as string[];
    const unsubscribe = subscribeToListings(
      getActiveRelays(),
      { since, categories, geohashPrefix },
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
    return subscribeToListingDeletions(getActiveRelays(), deletionSince, (event) => {
      const deleted = getDeletedEventIds(event);
      if (deleted.length > 0) addDeletions(deleted);
    });
  });

  return {
    get items() { return items; },
    get deletedEventIds() { return deletedEventIds; }
  };
}
