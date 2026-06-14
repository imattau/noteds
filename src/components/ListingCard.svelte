<script lang="ts">
  import { base } from '$app/paths';
  import { nip19 } from 'nostr-tools';
  import type { ListingInput } from '$lib/nostr/listings';

  let {
    listing,
    pubkey,
    created_at
  }: {
    listing: ListingInput;
    pubkey: string;
    created_at: number;
  } = $props();

  let naddr = $derived(nip19.naddrEncode({ kind: 30402, pubkey, identifier: listing.id }));

  function relativeTime(timestamp: number): string {
    const diffSeconds = Math.floor(Date.now() / 1000) - timestamp;
    if (diffSeconds < 60) return 'just now';
    const minutes = Math.floor(diffSeconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<a
  href="{base}/listing/{naddr}"
  class="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
>
  {#if listing.images.length > 0}
    <img src={listing.images[0].url} alt={listing.title} class="h-40 w-full object-cover sm:h-48" loading="lazy" decoding="async" />
  {:else}
    <div class="flex h-40 w-full items-center justify-center bg-slate-100 text-slate-400 sm:h-48">
      No image
    </div>
  {/if}

  <div class="flex flex-1 flex-col gap-1 p-3">
    <div class="flex items-start justify-between gap-2">
      <h3 class="text-sm font-semibold text-slate-900 sm:text-base">{listing.title}</h3>
      {#if listing.status === 'sold'}
        <span class="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Sold
        </span>
      {/if}
    </div>
    <p class="text-sm font-medium text-slate-900">{listing.price.amount} {listing.price.currency}</p>
    {#if listing.location}
      <p class="text-xs text-slate-500">{listing.location}</p>
    {/if}

  {#if listing.categories.length > 0}
    <div class="mt-1 flex flex-wrap gap-1">
      {#each listing.categories as category (category)}
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{category}</span>
      {/each}
    </div>
  {/if}

  {#if (listing.subcategories?.length ?? 0) > 0}
    <div class="mt-1 flex flex-wrap gap-1">
      {#each listing.subcategories as subcategory (subcategory.parent + ':' + subcategory.value)}
        <span class="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
          {subcategory.parent}: {subcategory.value}
        </span>
      {/each}
    </div>
  {/if}

  <p class="mt-auto pt-2 text-xs text-slate-400">{relativeTime(created_at)}</p>
</div>
</a>
