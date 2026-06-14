<script lang="ts">
  import ImageUploader from './ImageUploader.svelte';
  import LocationSuggestionList from './LocationSuggestionList.svelte';
  import { detectBrowserArea, watchLocationSearch, type LocationSuggestion } from '$lib/nostr/location';
  import { TOP_LEVEL_CATEGORIES, getSubcategories, type TopLevelCategory } from '$lib/nostr/categories';
  import {
    MAX_LISTING_IMAGES,
    type ListingImage,
    type ListingInput,
    type ListingSubcategory
  } from '$lib/nostr/listings';

  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';

  let {
    initial,
    onSubmit
  }: {
    initial?: ListingInput;
    onSubmit: (input: ListingInput, action: 'draft' | 'publish') => void;
  } = $props();

  let title = $state('');
  let summary = $state('');
  let content = $state('');
  let priceAmount = $state('');
  let priceCurrency = $state('USD');
  let categories = $state<string[]>([]);
  let subcategories = $state<ListingSubcategory[]>([]);
  let location = $state('');
  let locationQuery = $state('');
  let geohash = $state('');
  let locationSuggestions = $state<LocationSuggestion[]>([]);
  let searchingLocations = $state(false);
  let locationSearchError = $state<string | null>(null);
  let images = $state<ListingImage[]>([]);
  let showPreview = $state(false);
  let geoError = $state<string | null>(null);
  let draggedImageIndex = $state<number | null>(null);
  let dropTargetIndex = $state<number | null>(null);
  let submitting = $state(false);
  let pendingAction = $state<'draft' | 'publish' | null>(null);

  $effect(() => {
    const initialCategories = initial?.categories ? [...initial.categories] : [];
    const initialSubcategories = initial?.subcategories ? initial.subcategories.map((subcategory) => ({ ...subcategory })) : [];
    const missingParents = [...new Set(initialSubcategories.map((subcategory) => subcategory.parent))]
      .filter((parent) => !initialCategories.includes(parent));

    title = initial?.title ?? '';
    summary = initial?.summary ?? '';
    content = initial?.content ?? '';
    priceAmount = initial?.price?.amount ?? '';
    priceCurrency = initial?.price?.currency ?? 'USD';
    categories = [...initialCategories, ...missingParents];
    subcategories = initialSubcategories;
    location = initial?.location ?? '';
    locationQuery = initial?.location ?? '';
    geohash = initial?.geohash ?? '';
    images = initial?.images ? initial.images.map((image) => ({ url: image.url, sources: image.sources ? [...image.sources] : [image.url] })) : [];
  });

  function renderMarkdown(md: string): string {
    try {
      return DOMPurify.sanitize(marked.parse(md, { gfm: true, breaks: true }) as string);
    } catch {
      return md;
    }
  }

  function removeCategory(category: string) {
    categories = categories.filter((value) => value !== category);
    subcategories = subcategories.filter((value) => value.parent !== category);
  }

  function toggleTopLevelCategory(category: string) {
    if (categories.includes(category)) {
      categories = categories.filter((value) => value !== category);
      subcategories = subcategories.filter((value) => value.parent !== category);
      return;
    }

    categories = [...categories, category];
  }

  function toggleSubcategory(parent: string, value: string) {
    const exists = subcategories.some((subcategory) => subcategory.parent === parent && subcategory.value === value);
    if (exists) {
      subcategories = subcategories.filter((subcategory) => !(subcategory.parent === parent && subcategory.value === value));
      return;
    }

    if (!categories.includes(parent)) {
      categories = [...categories, parent];
    }

    subcategories = [...subcategories, { parent, value }];
  }

  function removeImage(index: number) {
    images = images.filter((_, currentIndex) => currentIndex !== index);
  }

  function clearSelectedLocation() {
    location = '';
    locationQuery = '';
    geohash = '';
    locationSuggestions = [];
    locationSearchError = null;
  }

  function selectLocationSuggestion(suggestion: LocationSuggestion) {
    location = suggestion.label;
    locationQuery = suggestion.label;
    geohash = suggestion.geohash;
    locationSuggestions = [];
    locationSearchError = null;
  }

  function handleLocationQueryInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    locationQuery = value;
    if (value !== location) {
      location = '';
      geohash = '';
    }
  }

  function moveImage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= images.length || toIndex >= images.length) return;

    const next = [...images];
    const [image] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, image);
    images = next;
  }

  function handleImageDragStart(index: number, event: DragEvent) {
    draggedImageIndex = index;
    dropTargetIndex = index;
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleImageDragOver(index: number, event: DragEvent) {
    event.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === index) return;
    dropTargetIndex = index;
  }

  function handleImageDrop(index: number, event: DragEvent) {
    event.preventDefault();
    const rawIndex = event.dataTransfer?.getData('text/plain');
    const fromIndex = rawIndex ? Number(rawIndex) : draggedImageIndex;
    if (fromIndex === null || Number.isNaN(fromIndex)) return;
    moveImage(fromIndex, index);
    draggedImageIndex = null;
    dropTargetIndex = null;
  }

  function handleImageDragEnd() {
    draggedImageIndex = null;
    dropTargetIndex = null;
  }

  function useMyLocation() {
    geoError = null;
    void detectBrowserArea({ precision: 6 }).then((area) => {
      if (!area) {
        geoError = 'Could not detect a rough area from this browser.';
        return;
      }
      selectLocationSuggestion(area);
    });
  }

  $effect(() => {
    return watchLocationSearch(
      locationQuery,
      (state) => {
        locationSuggestions = state.suggestions;
        searchingLocations = state.searching;
        locationSearchError = state.error;
      },
      { limit: 5 }
    );
  });

  function buildInput(): ListingInput {
    return {
      id: initial?.id ?? crypto.randomUUID(),
      title,
      summary,
      price: { amount: priceAmount, currency: priceCurrency },
      ...(location ? { location } : {}),
      ...(geohash ? { geohash } : {}),
      categories,
      subcategories: subcategories.map((subcategory) => ({ ...subcategory })),
      images: images.map((image) => ({
        url: image.url,
        sources: [...image.sources]
      })),
      status: initial?.status ?? 'active',
      content
    };
  }

</script>

<form
  class="flex flex-col gap-4"
  onsubmit={async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting) return;

    const submitter = event.submitter as HTMLButtonElement | null;
    const action = submitter?.dataset.action === 'draft' ? 'draft' : 'publish';
    submitting = true;
    pendingAction = action;

    try {
      await onSubmit(buildInput(), action);
    } finally {
      submitting = false;
      pendingAction = null;
    }
  }}
>
  <div>
    <label for="title" class="block text-sm font-medium text-slate-700">Title</label>
    <input
      id="title"
      type="text"
      class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
      bind:value={title}
    />
  </div>

  <div>
    <label for="summary" class="block text-sm font-medium text-slate-700">Summary</label>
    <textarea
      id="summary"
      rows="2"
      class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
      bind:value={summary}
    ></textarea>
  </div>

  <div>
    <div class="flex items-center justify-between">
      <label for="content" class="block text-sm font-medium text-slate-700">Description (Markdown)</label>
      <button
        type="button"
        class="text-xs font-medium text-blue-600 hover:underline"
        onclick={() => (showPreview = !showPreview)}
      >
        {showPreview ? 'Edit' : 'Preview'}
      </button>
    </div>
    {#if showPreview}
      <div class="prose prose-sm mt-1 max-w-none rounded-md border border-slate-200 p-3">
        {@html renderMarkdown(content)}
      </div>
    {:else}
      <textarea
        id="content"
        rows="6"
        class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
        bind:value={content}
      ></textarea>
    {/if}
  </div>

  <div class="flex flex-col gap-2 sm:flex-row">
    <div class="flex-1">
      <label for="price-amount" class="block text-sm font-medium text-slate-700">Price</label>
      <input
        id="price-amount"
        type="number"
        class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
        bind:value={priceAmount}
      />
    </div>
    <div class="sm:w-32">
      <label for="price-currency" class="block text-sm font-medium text-slate-700">Currency</label>
      <input
        id="price-currency"
        type="text"
        class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
        bind:value={priceCurrency}
      />
    </div>
  </div>

  <div>
    <div class="flex items-center justify-between gap-2">
      <span class="block text-sm font-medium text-slate-700">Categories</span>
      <span class="text-xs text-slate-500">Quick picks for the main listing type</span>
    </div>
    <div class="mt-2 flex flex-wrap gap-2">
      {#each TOP_LEVEL_CATEGORIES as category (category)}
        <button
          type="button"
          class="rounded-full border px-3 py-1 text-xs font-medium transition-colors {categories.includes(category) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
          onclick={() => toggleTopLevelCategory(category)}
        >
          {category}
        </button>
      {/each}
    </div>
    {#if categories.length > 0}
      <div class="mt-3 space-y-3">
        {#each categories as category (category)}
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-slate-700">{category} sub-categories</span>
              <button type="button" class="text-xs text-slate-500 hover:text-slate-700" onclick={() => removeCategory(category)}>
                Remove main category
              </button>
            </div>
            {#if getSubcategories(category as TopLevelCategory).length > 0}
              <div class="mt-2 flex flex-wrap gap-2">
                {#each getSubcategories(category as TopLevelCategory) as subcategory (subcategory)}
                  <button
                    type="button"
                    class="rounded-full border px-3 py-1 text-xs font-medium transition-colors {subcategories.some((value) => value.parent === category && value.value === subcategory) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
                    onclick={() => toggleSubcategory(category, subcategory)}
                  >
                    {subcategory}
                  </button>
                {/each}
              </div>
            {:else}
              <p class="mt-2 text-xs text-slate-500">No sub-categories defined yet for this category.</p>
            {/if}
            {#if subcategories.some((value) => value.parent === category)}
              <div class="mt-2 flex flex-wrap gap-1">
                {#each subcategories.filter((value) => value.parent === category) as subcategory (subcategory.parent + ':' + subcategory.value)}
                  <span class="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                    {subcategory.value}
                    <button
                      type="button"
                      class="text-slate-400 hover:text-slate-700"
                      onclick={() => toggleSubcategory(category, subcategory.value)}
                    >
                      ×
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="mt-3 text-xs text-slate-500">Select a main category to choose sub-categories.</p>
    {/if}
  </div>

  <div>
    <label for="location-search" class="block text-sm font-medium text-slate-700">Location</label>
    <input
      id="location-search"
      type="text"
      class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
      value={locationQuery}
      oninput={handleLocationQueryInput}
      placeholder="Search for a city, suburb, or region"
    />
    <div class="mt-1 flex items-center gap-2">
      <button
        type="button"
        class="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={useMyLocation}
      >
        Use my area
      </button>
      {#if location || geohash}
        <button
          type="button"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onclick={clearSelectedLocation}
        >
          Clear
        </button>
      {/if}
      {#if geohash}
        <span class="text-xs text-slate-500">geohash: {geohash}</span>
      {/if}
    </div>
    {#if location}
      <p class="mt-1 text-xs text-slate-500">Selected: {location}</p>
    {/if}
    {#if searchingLocations}
      <p class="mt-1 text-xs text-slate-500">Searching…</p>
    {:else if locationSearchError}
      <p class="mt-1 text-xs text-red-600">{locationSearchError}</p>
    {/if}
    {#if locationSuggestions.length > 0}
      <div class="mt-2">
        <LocationSuggestionList suggestions={locationSuggestions} onSelect={selectLocationSuggestion} />
      </div>
    {/if}
    {#if geoError}
      <p class="mt-1 text-xs text-red-600">{geoError}</p>
    {/if}
  </div>

  <div>
    <div class="flex items-center justify-between gap-2">
      <span class="block text-sm font-medium text-slate-700">Images</span>
      <span class="text-xs text-slate-500">{images.length}/{MAX_LISTING_IMAGES}</span>
    </div>
    <div class="mt-1">
      <ImageUploader
        currentCount={images.length}
        maxFiles={MAX_LISTING_IMAGES}
        onUpload={(image) => (images = [...images, { url: image.url, sources: [...image.sources] }])}
      />
    </div>
    {#if images.length > 0}
      <ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each images as image, index (image.url)}
          <li
            class="overflow-hidden rounded-lg border bg-white transition-colors {dropTargetIndex === index ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'}"
            draggable="true"
            ondragstart={(event) => handleImageDragStart(index, event)}
            ondragover={(event) => handleImageDragOver(index, event)}
            ondrop={(event) => handleImageDrop(index, event)}
            ondragend={handleImageDragEnd}
          >
            <div class="relative aspect-square bg-slate-100">
              <img src={image.url} alt={`Image ${index + 1}`} class="h-full w-full object-cover" />
              <div class="absolute left-2 top-2 flex gap-1">
                <button
                  type="button"
                  class="rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white disabled:opacity-40"
                  onclick={() => moveImage(index, index - 1)}
                  disabled={index === 0}
                >
                  ←
                </button>
                <button
                  type="button"
                  class="rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white disabled:opacity-40"
                  onclick={() => moveImage(index, index + 1)}
                  disabled={index === images.length - 1}
                >
                  →
                </button>
              </div>
              <button
                type="button"
                class="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white"
                onclick={() => removeImage(index)}
              >
                Remove
              </button>
            </div>
            <div class="flex items-center justify-between gap-2 px-2 py-1 text-xs text-slate-500">
              <span>Image {index + 1}</span>
              <span class="text-slate-400">Drag to reorder</span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="flex gap-2">
    <button
      type="submit"
      data-action="draft"
      class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      disabled={submitting}
    >
      {pendingAction === 'draft' ? 'Saving…' : 'Save Draft'}
    </button>
    <button
      type="submit"
      data-action="publish"
      class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      disabled={submitting}
    >
      {pendingAction === 'publish' ? 'Publishing…' : 'Publish'}
    </button>
  </div>
</form>
