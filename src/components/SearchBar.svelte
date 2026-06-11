<script lang="ts">
  import { encodeGeohash } from '$lib/nostr/geohash';
  import type { ListingFilters } from '$lib/nostr/searchParams';

  let {
    filters,
    onChange
  }: {
    filters: ListingFilters;
    onChange: (filters: ListingFilters) => void;
  } = $props();

  const CATEGORY_OPTIONS = ['Electronics', 'Furniture', 'Vehicles', 'Clothing', 'Free', 'Other'];
  const NEAR_ME_PRECISION_DEFAULT = 5;

  let keywordInput = $state('');
  let selectedCategories = $state<string[]>([]);
  let nearMeActive = $state(false);
  let precision = $state(NEAR_ME_PRECISION_DEFAULT);
  let geoError = $state<string | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    keywordInput = filters.keyword ?? '';
    selectedCategories = filters.categories ? [...filters.categories] : [];
    nearMeActive = !!filters.geohashPrefix;
  });

  function emitChange(overrides: Partial<ListingFilters> = {}) {
    const next: ListingFilters = {
      ...(keywordInput ? { keyword: keywordInput } : {}),
      ...(selectedCategories.length ? { categories: selectedCategories } : {}),
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
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      emitChange({ keyword: value || undefined });
    }, 300);
  }

  function toggleCategory(category: string) {
    if (selectedCategories.includes(category)) {
      selectedCategories = selectedCategories.filter((value) => value !== category);
    } else {
      selectedCategories = [...selectedCategories, category];
    }
    emitChange({ categories: selectedCategories.length ? selectedCategories : undefined });
  }

  function toggleNearMe() {
    geoError = null;
    if (nearMeActive) {
      nearMeActive = false;
      emitChange({ geohashPrefix: undefined });
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      geoError = 'Geolocation is not available in this browser.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        nearMeActive = true;
        const prefix = encodeGeohash(position.coords.latitude, position.coords.longitude, precision);
        emitChange({ geohashPrefix: prefix });
      },
      (error) => {
        geoError = error.message || 'Failed to get your location.';
      }
    );
  }

  function handlePrecisionChange(value: number) {
    precision = value;
    if (nearMeActive && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const prefix = encodeGeohash(position.coords.latitude, position.coords.longitude, precision);
        emitChange({ geohashPrefix: prefix });
      });
    }
  }
</script>

<div class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
  <input
    type="text"
    placeholder="Search listings…"
    class="block w-full rounded-md border-slate-300 shadow-sm sm:max-w-xs sm:text-sm"
    value={keywordInput}
    oninput={(e) => handleKeywordInput((e.currentTarget as HTMLInputElement).value)}
  />

  <div class="flex flex-wrap gap-1">
    {#each CATEGORY_OPTIONS as category (category)}
      <label class="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={selectedCategories.includes(category)}
          onchange={() => toggleCategory(category)}
        />
        {category}
      </label>
    {/each}
  </div>

  <div class="flex items-center gap-2">
    <button
      type="button"
      class="rounded-md border px-3 py-1 text-sm font-medium {nearMeActive ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
      onclick={toggleNearMe}
    >
      Near me
    </button>
    {#if nearMeActive}
      <input
        type="range"
        min="3"
        max="7"
        value={precision}
        oninput={(e) => handlePrecisionChange(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <span class="text-xs text-slate-500">precision {precision}</span>
    {/if}
  </div>

  {#if geoError}
    <p class="text-xs text-red-600">{geoError}</p>
  {/if}
</div>
