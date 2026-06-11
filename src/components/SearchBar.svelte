<script lang="ts">
  import { detectBrowserArea, getCachedBrowserArea } from '$lib/nostr/location';
  import type { ListingFilters } from '$lib/nostr/searchParams';

  let {
    filters,
    onChange
  }: {
    filters: ListingFilters;
    onChange: (filters: ListingFilters) => void;
  } = $props();

  let keywordInput = $state('');
  let locationInput = $state('');
  let nearMeActive = $state(false);
  let geoError = $state<string | null>(null);
  let autoDetectAttempted = $state(false);

  $effect(() => {
    keywordInput = filters.keyword ?? '';
    locationInput = filters.location ?? '';
    nearMeActive = !!filters.geohashPrefix;
  });

  $effect(() => {
    if (autoDetectAttempted) return;
    if (filters.keyword || filters.location || filters.geohashPrefix || filters.categories?.length) return;

    autoDetectAttempted = true;

    const cached = getCachedBrowserArea();
    if (cached) {
      nearMeActive = true;
      onChange({ geohashPrefix: cached.geohash.slice(0, 1) });
      return;
    }

    void detectBrowserArea({ precision: 1 }).then((area) => {
      if (!area) return;
      nearMeActive = true;
      onChange({ geohashPrefix: area.geohash });
    });
  });

  function emitChange(overrides: Partial<ListingFilters> = {}) {
    const next: ListingFilters = {
      ...(keywordInput ? { keyword: keywordInput } : {}),
      ...(locationInput ? { location: locationInput } : {}),
      ...(filters.categories?.length ? { categories: filters.categories } : {}),
      ...(filters.geohashPrefix ? { geohashPrefix: filters.geohashPrefix } : {}),
      ...overrides
    };

    for (const key of Object.keys(overrides) as (keyof ListingFilters)[]) {
      if (overrides[key] === undefined) {
        delete next[key];
      }
    }

    onChange(next);
  }

  function handleKeywordInput(value: string) {
    keywordInput = value;
    emitChange({ keyword: value || undefined });
  }

  function handleLocationInput(value: string) {
    autoDetectAttempted = true;
    locationInput = value;
    nearMeActive = false;
    geoError = null;
    emitChange({ location: value || undefined, geohashPrefix: undefined });
  }

  function clearLocation() {
    autoDetectAttempted = true;
    locationInput = '';
    nearMeActive = false;
    geoError = null;
    emitChange({ location: undefined, geohashPrefix: undefined });
  }

  function toggleNearMe() {
    autoDetectAttempted = true;
    geoError = null;
    if (nearMeActive) {
      nearMeActive = false;
      emitChange({ geohashPrefix: undefined });
      return;
    }

    void detectBrowserArea({ precision: 5 }).then((area) => {
      if (!area) {
        geoError = 'Could not detect a rough area from this browser.';
        return;
      }
      locationInput = '';
      nearMeActive = true;
      emitChange({ location: undefined, geohashPrefix: area.geohash });
    });
  }
</script>

<div class="rounded-lg border border-slate-200 bg-white p-3">
  <div class="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
    <label class="block">
      <span class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Search</span>
      <input
        type="text"
        placeholder="Help me find..."
        class="block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
        value={keywordInput}
        oninput={(e) => handleKeywordInput((e.currentTarget as HTMLInputElement).value)}
      />
    </label>

    <div class="block">
      <label for="location" class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Location</label>
      <div class="relative">
        <input
          id="location"
          type="text"
          placeholder="Suburb, city, country"
          class="block w-full rounded-md border-slate-300 py-2 pr-9 shadow-sm sm:text-sm"
          value={locationInput}
          oninput={(e) => handleLocationInput((e.currentTarget as HTMLInputElement).value)}
        />
        {#if locationInput || nearMeActive}
          <button
            type="button"
            class="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-slate-400 transition hover:text-slate-700"
            onclick={clearLocation}
            aria-label="Clear location"
            title="Clear location"
          >
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <span class="hidden text-xs font-medium uppercase tracking-wide text-slate-500 md:block">&nbsp;</span>
      <button
        type="button"
        class="rounded-md border px-4 py-2 text-sm font-medium transition-colors {nearMeActive ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
        onclick={toggleNearMe}
      >
        Near me
      </button>
    </div>
  </div>

  {#if geoError}
    <p class="mt-2 text-xs text-red-600">{geoError}</p>
  {/if}
</div>
