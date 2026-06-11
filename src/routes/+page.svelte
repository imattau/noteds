<script lang="ts">
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ListingCard from '$components/ListingCard.svelte';
  import SearchBar from '$components/SearchBar.svelte';
  import { subscribeToListings } from '$lib/nostr/feed';
  import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { filtersToSearchParams, parseFiltersFromSearchParams, type ListingFilters } from '$lib/nostr/searchParams';

  const CATEGORY_OPTIONS = ['Electronics', 'Furniture', 'Vehicles', 'Clothing', 'Free', 'Other'];

  interface FeedItem {
    listing: ListingInput;
    pubkey: string;
    created_at: number;
  }

  let items = $state<FeedItem[]>([]);
  let since = $state<number | undefined>(undefined);

  let filters = $derived(parseFiltersFromSearchParams(page.url.searchParams));

  function addItem(item: FeedItem) {
    const existingIndex = items.findIndex(
      (existing) => existing.listing.id === item.listing.id && existing.pubkey === item.pubkey
    );
    if (existingIndex === -1) {
      items = [...items, item];
    } else if (item.created_at > items[existingIndex].created_at) {
      items = items.map((existing, index) => (index === existingIndex ? item : existing));
    }
  }

  $effect(() => {
    const unsubscribe = subscribeToListings(
      getActiveRelays(),
      { since, categories: filters.categories, geohashPrefix: filters.geohashPrefix },
      (event) => {
        addItem({
          listing: parseListingEvent(event),
          pubkey: event.pubkey,
          created_at: event.created_at
        });
      }
    );

    return unsubscribe;
  });

  function loadMore() {
    const sevenDays = 7 * 24 * 60 * 60;
    since = (since ?? Math.floor(Date.now() / 1000)) - sevenDays;
  }

  function handleFiltersChange(changes: ListingFilters) {
    const next = { ...filters, ...changes };
    const params = filtersToSearchParams(next);
    const query = params.toString();
    const pathname = page.url.pathname;
    goto(query ? `${pathname}?${query}` : pathname, { replaceState: true, keepFocus: true, noScroll: true });
  }

  function toggleCategory(category: string) {
    const categories = filters.categories ?? [];
    const nextCategories = categories.includes(category)
      ? categories.filter((value) => value !== category)
      : [...categories, category];
    handleFiltersChange({ categories: nextCategories.length ? nextCategories : undefined });
  }

  let visibleItems = $derived(
    [...items]
      .filter((item) => {
        if (!filters.keyword) return true;
        const needle = filters.keyword.toLowerCase();
        return (
          item.listing.title.toLowerCase().includes(needle) ||
          item.listing.summary.toLowerCase().includes(needle) ||
          item.listing.content.toLowerCase().includes(needle) ||
          (item.listing.location ?? '').toLowerCase().includes(needle)
        );
      })
      .filter((item) => {
        if (!filters.location) return true;
        const needle = filters.location.toLowerCase();
        return (item.listing.location ?? '').toLowerCase().includes(needle);
      })
      .filter((item) => {
        if (!filters.categories?.length) return true;
        return filters.categories.every((category) => item.listing.categories.includes(category));
      })
      .sort((a, b) => b.created_at - a.created_at)
  );
</script>

<h1 class="text-2xl font-semibold">Feed</h1>

<div class="mt-4">
  <SearchBar {filters} onChange={handleFiltersChange} />
</div>

<div class="mt-4 flex flex-wrap gap-2">
  {#each CATEGORY_OPTIONS as category (category)}
    <button
      type="button"
      class="rounded-full border px-3 py-1 text-xs font-medium transition-colors {filters.categories?.includes(category) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
      onclick={() => toggleCategory(category)}
    >
      {category}
    </button>
  {/each}
</div>

<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {#each visibleItems as item (item.listing.id + item.pubkey)}
    <div transition:fade={{ duration: 150 }}>
      <ListingCard listing={item.listing} pubkey={item.pubkey} created_at={item.created_at} />
    </div>
  {/each}
</div>

{#if visibleItems.length === 0}
  <p class="mt-4 text-sm text-slate-500">No listings match your filters.</p>
{/if}

<div class="mt-6 flex justify-center">
  <button
    type="button"
    class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    onclick={loadMore}
  >
    Load more
  </button>
</div>
