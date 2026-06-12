<script lang="ts">
  import { loadNostrUser, type NostrUser } from '$lib/nostr/metadata';
  import { fade, scale } from 'svelte/transition';
  import AuthGate from '$components/AuthGate.svelte';
  import BlossomImage from '$components/BlossomImage.svelte';
  import { getDeletedAddresses, getDeletedEventIds } from '$lib/nostr/deletions';
  import { sendDirectMessage } from '$lib/nostr/dm';
  import { parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { eventStore, relayPool } from '$lib/nostr/runtime';
  import { collectEvents } from '$lib/nostr/requestEvents';
  import type { NostrEvent } from 'nostr-tools';

  const LISTING_LOAD_TIMEOUT_MS = 5000;

  let { data }: { data: { kind: number; pubkey: string; identifier: string } } = $props();

  let listing = $state<ListingInput | null>(null);
  let eventId = $state<string | null>(null);
  let deleted = $state(false);
  let deletedEventIds = $state<string[]>([]);
  let seller = $state<NostrUser | null>(null);
  let showContactModal = $state(false);
  let messageText = $state('');
  let sending = $state(false);
  let sendResult = $state<'success' | 'error' | null>(null);
  let sendError = $state<string | null>(null);

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

  async function handleSend() {
    if (!listing) return;
    sending = true;
    sendResult = null;
    sendError = null;
    try {
      await sendDirectMessage(data.pubkey, messageText);
      sendResult = 'success';
      messageText = '';
      setTimeout(() => (showContactModal = false), 1000);
    } catch (e) {
      sendResult = 'error';
      sendError = e instanceof Error ? e.message : 'Failed to send message.';
    } finally {
      sending = false;
    }
  }

  $effect(() => {
    let cancelled = false;
    const address = `${data.kind}:${data.pubkey}:${data.identifier}`;

    collectEvents(
      relayPool.request(getActiveRelays(), {
        kinds: [data.kind],
        authors: [data.pubkey],
        '#d': [data.identifier]
      }),
      LISTING_LOAD_TIMEOUT_MS
    ).then((events) => {
      if (cancelled) return;
      for (const event of events) {
        eventStore.add(event);
      }
      const latest = eventStore.getReplaceable(data.kind, data.pubkey, data.identifier);
      if (!latest) return;
      listing = parseListingEvent(latest);
      eventId = latest.id;
      deleted = deletedEventIds.includes(latest.id);
    });

    const deleteSubscription = relayPool
      .subscription(getActiveRelays(), { kinds: [5], '#a': [address] })
      .subscribe((response: any) => {
        if (response === 'EOSE' || cancelled) return;
        if (!getDeletedAddresses(response).includes(address)) return;
        const deletedIds = getDeletedEventIds(response);
        deletedEventIds = [...new Set([...deletedEventIds, ...deletedIds])];
        deleted = true;
      });

    loadNostrUser(data.pubkey).then((user) => {
      if (!cancelled) seller = user;
    });

    return () => {
      cancelled = true;
      deleteSubscription.unsubscribe();
    };
  });
</script>

{#if deleted}
  <div class="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
    This listing has been deleted by the seller.
  </div>
{:else if listing}
  <div class="flex flex-col gap-4">
    {#if listing.images.length > 0}
      <div class="flex gap-2 overflow-x-auto sm:grid sm:grid-cols-3 sm:overflow-visible">
        {#each listing.images as image (image.url)}
          <BlossomImage
            sources={image.sources}
            alt={listing.title}
            class="h-48 w-64 flex-shrink-0 rounded-lg object-cover sm:h-40 sm:w-full"
          />
        {/each}
      </div>
    {/if}

    <h1 class="text-2xl font-semibold">{listing.title}</h1>
    <p class="text-lg font-medium">{listing.price.amount} {listing.price.currency}</p>

    {#if listing.location}
      <p class="text-sm text-slate-500">{listing.location}</p>
    {/if}

    {#if listing.categories.length > 0}
      <div class="flex flex-wrap gap-1">
        {#each listing.categories as category (category)}
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{category}</span>
        {/each}
      </div>
    {/if}

    {#if (listing.subcategories?.length ?? 0) > 0}
      <div class="flex flex-wrap gap-1">
        {#each listing.subcategories as subcategory (subcategory.parent + ':' + subcategory.value)}
          <span class="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
            {subcategory.parent}: {subcategory.value}
          </span>
        {/each}
      </div>
    {/if}

    <div class="prose prose-sm max-w-none">
      {@html renderMarkdown(listing.content)}
    </div>

    {#if seller}
      <div class="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
        {#if seller.metadata?.picture}
          <img src={seller.metadata.picture} alt="" class="h-8 w-8 rounded-full object-cover" />
        {/if}
        <span class="text-sm text-slate-700">{seller.metadata?.name || seller.metadata?.display_name || 'Seller'}</span>
      </div>
    {/if}

    <button
      type="button"
      class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      onclick={() => (showContactModal = true)}
    >
      Contact seller
    </button>

    {#if showContactModal}
      <div class="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" transition:fade={{ duration: 100 }}>
        <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg" transition:scale={{ duration: 150, start: 0.95 }}>
          <h2 class="text-lg font-semibold">Contact seller</h2>
          <AuthGate>
            <textarea
              rows="4"
              class="mt-2 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
              placeholder="Write a message…"
              bind:value={messageText}
            ></textarea>
            {#if sendResult === 'success'}
              <p class="mt-2 text-sm text-green-600">Message sent!</p>
            {:else if sendResult === 'error'}
              <p class="mt-2 text-sm text-red-600">{sendError}</p>
            {/if}
            <div class="mt-3 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onclick={() => (showContactModal = false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                onclick={handleSend}
                disabled={sending || !messageText.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </AuthGate>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <p class="text-sm text-slate-500">Loading listing…</p>
{/if}
