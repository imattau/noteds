<script lang="ts">
  import ImageUploader from './ImageUploader.svelte';
  import { detectBrowserArea } from '$lib/nostr/location';
  import type { ListingInput } from '$lib/nostr/listings';

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
  let categoryInput = $state('');
  let location = $state('');
  let geohash = $state('');
  let images = $state<string[]>([]);
  let showPreview = $state(false);
  let geoError = $state<string | null>(null);

  $effect(() => {
    title = initial?.title ?? '';
    summary = initial?.summary ?? '';
    content = initial?.content ?? '';
    priceAmount = initial?.price.amount ?? '';
    priceCurrency = initial?.price.currency ?? 'USD';
    categories = initial?.categories ? [...initial.categories] : [];
    location = initial?.location ?? '';
    geohash = initial?.geohash ?? '';
    images = initial?.images ? [...initial.images] : [];
  });

  function escapeHtml(input: string): string {
    return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMarkdown(md: string): string {
    let html = escapeHtml(md);
    html = html.replace(/^# (.+)$/gm, '<h1 class="mb-2 mt-4 text-xl font-semibold">$1</h1>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="mb-2 mt-3 text-lg font-semibold">$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" class="text-blue-600 underline" target="_blank" rel="noopener noreferrer">$1</a>');
    return html
      .split(/\n\s*\n/)
      .map((block) => `<p class="mb-2">${block.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function addCategory() {
    const trimmed = categoryInput.trim();
    if (trimmed && !categories.includes(trimmed)) {
      categories = [...categories, trimmed];
    }
    categoryInput = '';
  }

  function removeCategory(category: string) {
    categories = categories.filter((value) => value !== category);
  }

  function removeImage(url: string) {
    images = images.filter((value) => value !== url);
  }

  function useMyLocation() {
    geoError = null;
    void detectBrowserArea({ precision: 6 }).then((area) => {
      if (!area) {
        geoError = 'Could not detect a rough area from this browser.';
        return;
      }
      location = area.label;
      geohash = area.geohash;
    });
  }

  function buildInput(): ListingInput {
    return {
      id: initial?.id ?? crypto.randomUUID(),
      title,
      summary,
      price: { amount: priceAmount, currency: priceCurrency },
      ...(location ? { location } : {}),
      ...(geohash ? { geohash } : {}),
      categories,
      images,
      status: initial?.status ?? 'active',
      content
    };
  }

  function handleSubmit(action: 'draft' | 'publish') {
    onSubmit(buildInput(), action);
  }
</script>

<form class="flex flex-col gap-4" onsubmit={(e) => e.preventDefault()}>
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
    <span class="block text-sm font-medium text-slate-700">Categories</span>
    <div class="mt-1 flex gap-2">
      <input
        type="text"
        class="block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
        bind:value={categoryInput}
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
      />
      <button
        type="button"
        class="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={addCategory}
      >
        Add
      </button>
    </div>
    {#if categories.length > 0}
      <div class="mt-2 flex flex-wrap gap-1">
        {#each categories as category (category)}
          <span class="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {category}
            <button type="button" class="text-slate-400 hover:text-slate-700" onclick={() => removeCategory(category)}>
              ×
            </button>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <div>
    <label for="location" class="block text-sm font-medium text-slate-700">Location</label>
    <input
      id="location"
      type="text"
      class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
      bind:value={location}
    />
    <div class="mt-1 flex items-center gap-2">
      <button
        type="button"
        class="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={useMyLocation}
      >
        Use my area
      </button>
      {#if geohash}
        <span class="text-xs text-slate-500">geohash: {geohash}</span>
      {/if}
    </div>
    {#if geoError}
      <p class="mt-1 text-xs text-red-600">{geoError}</p>
    {/if}
  </div>

  <div>
    <span class="block text-sm font-medium text-slate-700">Images</span>
    <div class="mt-1">
      <ImageUploader onUpload={(url) => (images = [...images, url])} />
    </div>
    {#if images.length > 0}
      <ul class="mt-2 flex flex-col gap-1">
        {#each images as url (url)}
          <li class="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs">
            <span class="truncate">{url}</span>
            <button type="button" class="text-slate-400 hover:text-slate-700" onclick={() => removeImage(url)}>
              Remove
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="flex gap-2">
    <button
      type="button"
      class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      onclick={() => handleSubmit('draft')}
    >
      Save Draft
    </button>
    <button
      type="button"
      class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      onclick={() => handleSubmit('publish')}
    >
      Publish
    </button>
  </div>
</form>
