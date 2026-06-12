<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import SearchBar from '$components/SearchBar.svelte';
  import {
    cacheBrowseDeletions,
    cacheBrowseItem,
    loadBrowseCacheSnapshot,
    mergeBrowseCaches,
    primeBrowseCacheMemory,
    queryBrowseCache
  } from '$lib/nostr/browseCache';
  import { buildBrowseCounts } from '$lib/nostr/browseCounts';
  import { subscribeToListings } from '$lib/nostr/feed';
  import { TOP_LEVEL_CATEGORIES } from '$lib/nostr/categories';
  import { getDeletedEventIds } from '$lib/nostr/deletions';
  import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { relayPool } from '$lib/nostr/signer';
  import { parseFiltersFromSearchParams, type ListingFilters } from '$lib/nostr/searchParams';

  interface FeedItem {
    listing: ListingInput;
    pubkey: string;
    created_at: number;
    eventId: string;
  }

  const browseCache = loadBrowseCacheSnapshot();
  let items = $state<FeedItem[]>(browseCache.items);
  let since = $state<number | undefined>(undefined);
  let expandedCategories = $state<string[]>([]);
  let deletedEventIds = $state<string[]>(browseCache.deletedEventIds);

  let filters = $derived(parseFiltersFromSearchParams(page.url.searchParams));
  const categoryThemes = [
    { accent: 'bg-teal-700', dot: 'bg-teal-100 text-teal-800', border: 'border-teal-200' },
    { accent: 'bg-sky-700', dot: 'bg-sky-100 text-sky-800', border: 'border-sky-200' },
    { accent: 'bg-emerald-700', dot: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200' },
    { accent: 'bg-rose-700', dot: 'bg-rose-100 text-rose-800', border: 'border-rose-200' },
    { accent: 'bg-violet-700', dot: 'bg-violet-100 text-violet-800', border: 'border-violet-200' },
    { accent: 'bg-blue-700', dot: 'bg-blue-100 text-blue-800', border: 'border-blue-200' }
  ];

  function addItem(item: FeedItem) {
    if (deletedEventIds.includes(item.eventId)) {
      return;
    }
    const existingIndex = items.findIndex(
      (existing) => existing.listing.id === item.listing.id && existing.pubkey === item.pubkey
    );
    if (existingIndex === -1) {
      items = [...items, item];
    } else if (item.created_at > items[existingIndex].created_at) {
      items = items.map((existing, index) => (index === existingIndex ? item : existing));
    }
    void cacheBrowseItem(item);
  }

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
      }
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
      { since, categories: filters.categories, geohashPrefix: filters.geohashPrefix },
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
    const unsubscribe = relayPool.subscription(getActiveRelays(), { kinds: [5] }).subscribe((response: any) => {
      if (response === 'EOSE') return;
      const deleted = getDeletedEventIds(response);
      if (deleted.length === 0) return;
      deletedEventIds = [...new Set([...deletedEventIds, ...deleted])];
      items = items.filter((item) => !deleted.includes(item.eventId));
      void cacheBrowseDeletions(deleted);
    });

    return () => unsubscribe.unsubscribe();
  });

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

    if ('categories' in changes) {
      if (changes.categories?.length) {
        params.set('cat', changes.categories.join(','));
      } else {
        params.delete('cat');
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
    const pathname = page.url.pathname;
    goto(query ? `${pathname}?${query}` : pathname, { replaceState: true, keepFocus: true, noScroll: true });
  }

  function openCategory(category: string) {
    const query = page.url.searchParams.toString();
    goto(`/category/${encodeURIComponent(category)}${query ? `?${query}` : ''}`, {
      replaceState: false,
      keepFocus: true,
      noScroll: true
    });
  }

  function openSubcategory(parent: string, value: string) {
    const query = new URLSearchParams(page.url.searchParams);
    query.set('sub', `${parent}::${value}`);
    goto(`/category/${encodeURIComponent(parent)}?${query.toString()}`, {
      replaceState: false,
      keepFocus: true,
      noScroll: true
    });
  }

  function toggleExpandedCategory(category: string) {
    expandedCategories = expandedCategories.includes(category)
      ? expandedCategories.filter((value) => value !== category)
      : [...expandedCategories, category];
  }

  let hasSearchFilters = $derived(
    Boolean(
      filters.keyword ||
        filters.location ||
        filters.geohashPrefix ||
        filters.categories?.length ||
        filters.subcategories?.length
    )
  );

  let browseData = $derived.by(() => buildBrowseCounts(items, filters));
  let browseCategories = $derived(
    browseData.categoryBrowseEntries.map((entry, index) => ({
      ...entry,
      theme: categoryThemes[index % categoryThemes.length]
    }))
  );
  let selectedItems = $derived([...browseData.selectedItems].sort((a, b) => b.created_at - a.created_at));

  let activeSelectionCount = $derived(selectedItems.length);
</script>

<section class="overflow-visible rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-5 py-6 shadow-sm sm:px-8 sm:py-8">
  <div class="max-w-4xl">
    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Browse classifieds</p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
      Find what you need by category first.
    </h1>
    <p class="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
      Start broad, drill into sub-categories, then refine with search or location.
    </p>
  </div>

  <div class="mt-6">
    <SearchBar {filters} onChange={handleFiltersChange} />
  </div>

  <div class="mt-5 flex flex-wrap gap-2">
    {#each TOP_LEVEL_CATEGORIES as category (category)}
      <button
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-medium transition-colors {filters.categories?.includes(category) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
        onclick={() => openCategory(category)}
      >
        {category}
      </button>
    {/each}
  </div>
</section>

{#if hasSearchFilters}
  <section class="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active selection</p>
        <p class="mt-1 text-sm text-slate-700">
          {activeSelectionCount} listings match the current search and category filters.
        </p>
      </div>
      <button
        type="button"
        class="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        onclick={() => goto(page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true })}
      >
        Clear filters
      </button>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      {#if filters.categories?.length}
        {#each filters.categories as category (category)}
          <span class="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">{category}</span>
        {/each}
      {/if}
      {#if filters.subcategories?.length}
        {#each filters.subcategories as subcategory (subcategory)}
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{subcategory}</span>
        {/each}
      {/if}
      {#if filters.keyword}
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">"{filters.keyword}"</span>
      {/if}
      {#if filters.location}
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{filters.location}</span>
      {/if}
    </div>
  </section>
{/if}

<section class="mt-8">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h2 class="text-lg font-semibold text-slate-950 sm:text-xl">Popular categories</h2>
      <p class="mt-1 text-sm text-slate-500">Tap a card to narrow the browsing scope. Counts update from the current search.</p>
    </div>
    <p class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Click counts to browse</p>
  </div>

  <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each browseCategories as entry (entry.category)}
      {@const isExpanded = expandedCategories.includes(entry.category)}
      {@const previewSubcategories = isExpanded ? entry.subcategories : entry.subcategories.slice(0, 6)}
      {@const hiddenCount = Math.max(entry.subcategories.length - previewSubcategories.length, 0)}
      <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-white {entry.theme.accent}"
          onclick={() => openCategory(entry.category)}
        >
          <span class="flex items-center gap-3">
            <span class="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-sm font-semibold">
              {entry.category.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <span class="block text-base font-semibold">{entry.category}</span>
              <span class="block text-xs text-white/80">{entry.totalCount} matching listings</span>
            </span>
          </span>
          <span class="rounded-full bg-white/15 px-2 py-1 text-xs font-semibold">
            {entry.totalCount > 0 ? `${entry.totalCount}` : '0'}
          </span>
        </button>

        <div class="relative px-4 py-4">
          <div class="flex flex-wrap gap-2">
            {#if previewSubcategories.length > 0}
              {#each previewSubcategories as subcategory (subcategory.value)}
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 {entry.theme.border}"
                  onclick={() => openSubcategory(entry.category, subcategory.value)}
                >
                  <span>{subcategory.value}</span>
                  {#if subcategory.count > 0}
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {subcategory.count}
                    </span>
                  {/if}
                </button>
              {/each}
            {:else}
              <p class="text-sm text-slate-500">No sub-categories defined yet.</p>
            {/if}
          </div>

          {#if hiddenCount > 0}
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent"></div>
          {/if}
        </div>

        <div class="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            class="rounded-full px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            onclick={() => toggleExpandedCategory(entry.category)}
          >
            {#if hiddenCount > 0 && !isExpanded}
              Show more
            {:else if isExpanded}
              Show less
            {:else}
              Browse category
            {/if}
          </button>
        </div>
      </article>
    {/each}
  </div>
</section>
