import { onDestroy, untrack } from 'svelte';
import {
  cacheBrowseDeletions,
  cacheBrowseItems,
  loadBrowseCacheSnapshot,
  mergeBrowseCaches,
  normalizeDeletionKeys,
  primeBrowseCacheMemory,
  queryBrowseCache
} from '$lib/nostr/browseCache';
import {
  DEFAULT_LISTING_BACKFILL_DAYS,
  fetchListingDeletions,
  fetchOlderListings,
  subscribeToListingDeletions,
  subscribeToListings
} from '$lib/nostr/feed';
import { deletionKey, getDeletedAddresses, getDeletedEventIds, getDeletionKeys } from '$lib/nostr/deletions';
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

function itemDeletionKey(item: FeedItem): string {
  return deletionKey(item.pubkey, item.eventId);
}

function listingAddress(item: FeedItem): string {
  return `30402:${item.pubkey}:${item.listing.id}`;
}

export function useBrowseFeed(options: {
  filters: () => ListingFilters;
  since: () => number | undefined;
  categories: () => string[] | undefined;
  categoryScope?: () => string | undefined;
}) {
  let items = $state<FeedItem[]>([]);
  /** deletionKey() values: a deletion only hides listings by its own author. */
  let deletionKeys = $state<string[]>([]);
  let browseCacheUpdatedAt = 0;
  // Each older page raises the cap by what it added, so paged-in listings
  // aren't trimmed straight back out.
  let extraCapacity = 0;
  let loadingOlder = $state(false);
  let reachedOldest = $state(false);
  let olderRequestToken = 0;
  /** Oldest created_at any older page has returned, so pages never repeat. */
  let olderCursor: number | null = null;

  /** Feed items are always kept newest first, so pages don't need to re-sort. */
  function newestFirst(list: FeedItem[]): FeedItem[] {
    return list.sort((a, b) => b.created_at - a.created_at).slice(0, MAX_FEED_ITEMS + extraCapacity);
  }

  $effect(() => {
    const browseCache = loadBrowseCacheSnapshot();
    untrack(() => {
      if (items.length === 0) {
        items = browseCache.items;
      }
      if (deletionKeys.length === 0) {
        deletionKeys = browseCache.deletionKeys;
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

    const deleted = new Set(deletionKeys);
    const map = new Map<string, FeedItem>();
    for (const item of items) {
      map.set(`${item.listing.id}:${item.pubkey}`, item);
    }
    for (const item of batch) {
      if (deleted.has(itemDeletionKey(item))) continue;
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
    const known = new Set(deletionKeys);
    const fresh = Array.from(pendingDeletions).filter((key) => !known.has(key));
    pendingDeletions = new Set();
    if (fresh.length === 0) return;

    const freshSet = new Set(fresh);
    deletionKeys = normalizeDeletionKeys([...deletionKeys, ...fresh]);
    items = items.filter((item) => !freshSet.has(itemDeletionKey(item)));
    void cacheBrowseDeletions(fresh);
  }

  /** Queue deletions by deletionKey(). */
  function addDeletions(keys: string[]) {
    for (const key of keys) pendingDeletions.add(key);
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
      deletionKeys,
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
      deletionKeys = merged.deletionKeys;
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
    untrack(() => {
      // A new relay scope starts paging from scratch.
      olderRequestToken += 1;
      extraCapacity = 0;
      olderCursor = null;
      loadingOlder = false;
      reachedOldest = false;
    });
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
      const keys = getDeletionKeys(event);
      if (keys.length > 0) addDeletions(keys);
    });
  });

  function inFeedScope(item: FeedItem, categories: string[], geohashPrefix: string | undefined): boolean {
    if (categories.length > 0 && !item.listing.categories.some((category) => categories.includes(category))) return false;
    return !geohashPrefix || (item.listing.geohash ?? '').startsWith(geohashPrefix);
  }

  /**
   * Fetch the page of listings just older than the oldest one loaded for the
   * current relay scope. Resolves to how many new listings were added.
   */
  async function loadOlder(): Promise<number> {
    if (loadingOlder || reachedOldest) return 0;
    const token = ++olderRequestToken;
    const geohashPrefix = feedGeohashPrefix;
    const categories = JSON.parse(feedCategoriesKey) as string[];
    const scoped = items.filter((item) => inFeedScope(item, categories, geohashPrefix));
    let until = Math.floor(Date.now() / 1000);
    for (const item of scoped) until = Math.min(until, item.created_at);
    if (olderCursor !== null) until = Math.min(until, olderCursor);
    loadingOlder = true;

    try {
      const relays = getActiveRelays();
      const events = await fetchOlderListings(relays, { categories, geohashPrefix }, until);
      if (token !== olderRequestToken) return 0;
      for (const event of events) {
        olderCursor = Math.min(olderCursor ?? event.created_at, event.created_at);
      }

      const known = new Set(items.map((item) => `${item.listing.id}:${item.pubkey}`));
      const deleted = new Set(deletionKeys);
      const page = new Map<string, FeedItem>();
      for (const event of events) {
        const item: FeedItem = {
          listing: parseListingEvent(event),
          pubkey: event.pubkey,
          created_at: event.created_at,
          eventId: event.id
        };
        const key = `${item.listing.id}:${item.pubkey}`;
        if (known.has(key) || deleted.has(itemDeletionKey(item))) continue;
        const existing = page.get(key);
        if (!existing || item.created_at > existing.created_at) page.set(key, item);
      }
      if (page.size === 0) {
        reachedOldest = true;
        return 0;
      }

      // Older pages predate the live deletion subscription's window.
      const pageItems = Array.from(page.values());
      const deletions = await fetchListingDeletions(
        relays,
        pageItems.map((item) => item.eventId),
        pageItems.map(listingAddress)
      );
      if (token !== olderRequestToken) return 0;
      const removed = new Set<string>();
      for (const deletion of deletions) {
        const ids = new Set(getDeletedEventIds(deletion));
        const addresses = new Set(getDeletedAddresses(deletion));
        for (const item of pageItems) {
          // Only the author can delete a listing; an address deletion covers
          // versions published up to the deletion.
          if (deletion.pubkey !== item.pubkey) continue;
          if (ids.has(item.eventId) || (addresses.has(listingAddress(item)) && item.created_at <= deletion.created_at)) {
            removed.add(itemDeletionKey(item));
          }
        }
      }
      const added = pageItems.filter((item) => !removed.has(itemDeletionKey(item)));
      if (removed.size > 0) addDeletions(Array.from(removed));
      if (added.length === 0) return 0;

      extraCapacity += added.length;
      items = newestFirst([...items, ...added]);
      return added.length;
    } finally {
      if (token === olderRequestToken) loadingOlder = false;
    }
  }

  return {
    get items() { return items; },
    get deletionKeys() { return deletionKeys; },
    get loadingOlder() { return loadingOlder; },
    get reachedOldest() { return reachedOldest; },
    loadOlder
  };
}
