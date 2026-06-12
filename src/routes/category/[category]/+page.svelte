<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, untrack } from 'svelte';
  import {
    cacheBrowseDeletions,
    cacheBrowseItems,
    loadBrowseCacheSnapshot,
    mergeBrowseCaches,
    primeBrowseCacheMemory,
    queryBrowseCache
  } from '$lib/nostr/browseCache';
  import { buildBrowseCounts } from '$lib/nostr/browseCounts';
  import ListingCard from '$components/ListingCard.svelte';
  import SearchBar from '$components/SearchBar.svelte';
  import { DEFAULT_LISTING_BACKFILL_DAYS, subscribeToListings } from '$lib/nostr/feed';
  import { getSubcategories, type TopLevelCategory } from '$lib/nostr/categories';
  import { getDeletedEventIds } from '$lib/nostr/deletions';
  import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { relayPool } from '$lib/nostr/signer';
  import { parseFiltersFromSearchParams, type ListingFilters } from '$lib/nostr/searchParams';

  let { data }: { data: { category: string } } = $props();

  interface FeedItem {
    listing: ListingInput;
    pubkey: string;
    created_at: number;
    eventId: string;
  }

  const browseCache = loadBrowseCacheSnapshot();
  let items = $state<FeedItem[]>(browseCache.items);
  let since = $state<number | undefined>(undefined);
  let filters = $derived(parseFiltersFromSearchParams(page.url.searchParams));
  let category = $derived(data.category as TopLevelCategory);
  let subcategoryFilters = $derived((filters.subcategories ?? []).filter((entry) => entry.startsWith(`${category}::`)));
  let deletedEventIds = $state<string[]>([]);

  // Incoming relay events can arrive in large bursts (e.g. a 90-day backfill).
  // Batch them so the reactive item list and IndexedDB cache are each updated
  // once per batch instead of once per event.
  const FEED_FLUSH_DELAY_MS = 150;
  let pendingItems: FeedItem[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingItems() {
    flushTimer = null;
    if (pendingItems.length === 0) return;
    const batch = pendingItems;
    pendingItems = [];

    let next = items;
    for (const item of batch) {
      if (deletedEventIds.includes(item.eventId)) continue;
      const existingIndex = next.findIndex(
        (existing) => existing.listing.id === item.listing.id && existing.pubkey === item.pubkey
      );
      if (existingIndex === -1) {
        next = [...next, item];
      } else if (item.created_at > next[existingIndex].created_at) {
        next = next.map((existing, index) => (index === existingIndex ? item : existing));
      }
    }
    items = next;

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
    const current = untrack(() => ({
      items,
      deletedEventIds,
      updatedAt: browseCache.updatedAt
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
      category
    ).then((cache) => {
      if (token !== browseQueryToken) {
        return;
      }

      const merged = mergeBrowseCaches(current, cache);

      items = merged.items;
      deletedEventIds = merged.deletedEventIds;
      primeBrowseCacheMemory(merged);
    });

    return undefined;
  });

  $effect(() => {
    const unsubscribe = subscribeToListings(
      getActiveRelays(),
      { since, categories: [category], geohashPrefix: filters.geohashPrefix },
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

  function loadMore() {
    const sevenDays = 7 * 24 * 60 * 60;
    since = (since ?? Math.floor(Date.now() / 1000)) - sevenDays;
  }

  function handleFiltersChange(changes: ListingFilters) {
    const params = new URLSearchParams(page.url.searchParams);

    if ('keyword' in changes) {
      if (changes.keyword) {
        params.set('q', changes.keyword);
      } else {
        params.delete('q');
      }
    }

    if ('location' in changes) {
      if (changes.location) {
        params.set('loc', changes.location);
      } else {
        params.delete('loc');
      }
    }

    if ('geohashPrefix' in changes) {
      if (changes.geohashPrefix) {
        params.set('geo', changes.geohashPrefix);
      } else {
        params.delete('geo');
      }
    }

    const query = params.toString();
    goto(query ? `${page.url.pathname}?${query}` : page.url.pathname, {
      replaceState: true,
      keepFocus: true,
      noScroll: true
    });
  }

  function toggleSubcategory(value: string) {
    const key = `${category}::${value}`;
    const existing = filters.subcategories ?? [];
    const next = existing.includes(key) ? existing.filter((entry) => entry !== key) : [key];
    const params = new URLSearchParams(page.url.searchParams);
    if (next.length) {
      params.set('sub', next.join(','));
    } else {
      params.delete('sub');
    }
    goto(`${page.url.pathname}?${params.toString()}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true
    });
  }

  let browseData = $derived.by(() => buildBrowseCounts(items, filters, category));
  let visibleItems = $derived([...browseData.selectedItems].sort((a, b) => b.created_at - a.created_at));
  let subcategoryCounts = $derived(
    getSubcategories(category).map((value) => ({
      value,
      count:
        browseData.categoryBrowseEntries
          .find((entry) => entry.category === category)
          ?.subcategories.find((subcategory) => subcategory.value === value)?.count ?? 0
    }))
  );

  let selectedCount = $derived(visibleItems.length);
</script>

<svelte:head>
  <title>{category} - noteds</title>
</svelte:head>

<section class="overflow-visible rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-5 py-6 shadow-sm sm:px-8 sm:py-8">
  <div class="max-w-4xl">
    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Category browse</p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{category}</h1>
    <p class="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
      Browse listings in this category, narrow by sub-category, and keep search/location filters active.
    </p>
  </div>

  <div class="mt-6">
    <SearchBar {filters} onChange={handleFiltersChange} allowAutoDetect={false} />
  </div>

  <div class="mt-5 flex flex-wrap gap-2">
    <a
      href="/"
      class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
    >
      All categories
    </a>
    <span class="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
      {selectedCount} matching listings
    </span>
  </div>
</section>

<section class="mt-8">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h2 class="text-lg font-semibold text-slate-950 sm:text-xl">Sub-categories</h2>
      <p class="mt-1 text-sm text-slate-500">Each count updates from the current search scope.</p>
    </div>
    <button
      type="button"
      class="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
      onclick={() => goto(`/category/${encodeURIComponent(category)}`, { replaceState: true, keepFocus: true, noScroll: true })}
    >
      Clear sub-category
    </button>
  </div>

  <div class="mt-5 flex flex-wrap gap-2">
    {#each subcategoryCounts as subcategory (subcategory.value)}
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        onclick={() => toggleSubcategory(subcategory.value)}
      >
        <span>{subcategory.value}</span>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {subcategory.count}
        </span>
      </button>
    {/each}
  </div>
</section>

<section class="mt-8">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h2 class="text-lg font-semibold text-slate-950 sm:text-xl">Listings</h2>
      <p class="mt-1 text-sm text-slate-500">
        {#if subcategoryFilters.length}
          Filtered to the selected sub-category.
        {:else}
          Showing all listings in this category.
        {/if}
      </p>
    </div>
    <button
      type="button"
      class="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
      onclick={loadMore}
    >
      Load more
    </button>
  </div>

  <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {#each visibleItems as item (item.listing.id + item.pubkey)}
      <ListingCard listing={item.listing} pubkey={item.pubkey} created_at={item.created_at} />
    {/each}
  </div>

  {#if visibleItems.length === 0}
    <p class="mt-4 text-sm text-slate-500">No listings match this category and filter combination.</p>
  {/if}
</section>
