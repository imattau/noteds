<script lang="ts">
  import AuthGate from '$components/AuthGate.svelte';
  import { account, relayPool, signer } from '$lib/nostr/signer';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { buildListingEvent, parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { saveDraft } from '$lib/nostr/drafts';

  interface OwnedListing {
    listing: ListingInput;
    created_at: number;
  }

  let items = $state<OwnedListing[]>([]);
  let error = $state<string | null>(null);

  $effect(() => {
    const pubkey = $account?.pubkey;
    if (!pubkey) {
      items = [];
      return;
    }

    const subscription = relayPool
      .subscription(getActiveRelays(), { kinds: [30402], authors: [pubkey] })
      .subscribe((response: any) => {
        if (response === 'EOSE') return;
        const listing = parseListingEvent(response);
        const existingIndex = items.findIndex((item) => item.listing.id === listing.id);
        if (existingIndex === -1) {
          items = [...items, { listing, created_at: response.created_at }];
        } else if (response.created_at > items[existingIndex].created_at) {
          items = items.map((item, index) => (index === existingIndex ? { listing, created_at: response.created_at } : item));
        }
      });

    return () => subscription.unsubscribe();
  });

  let sortedItems = $derived([...items].sort((a, b) => b.created_at - a.created_at));

  async function startEditing(listing: ListingInput) {
    await saveDraft(listing);
  }

  async function markSold(listing: ListingInput) {
    error = null;
    try {
      const updated: ListingInput = { ...listing, status: 'sold' };
      const template = buildListingEvent(updated, false);
      const event = await signer.signEvent(template);
      await relayPool.publish(getActiveRelays(), event);
      const index = items.findIndex((item) => item.listing.id === listing.id);
      if (index !== -1) {
        items = items.map((item, i) => (i === index ? { listing: updated, created_at: event.created_at } : item));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark listing as sold.';
    }
  }
</script>

<h1 class="text-2xl font-semibold">My Listings</h1>

<AuthGate>
  <div class="mt-4">
    {#if error}
      <p class="mb-2 text-sm text-red-600">{error}</p>
    {/if}

    {#if sortedItems.length === 0}
      <p class="text-sm text-slate-500">You haven't published any listings yet.</p>
    {:else}
      <ul class="flex flex-col gap-3">
        {#each sortedItems as item (item.listing.id)}
          <li class="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-sm font-semibold text-slate-900">{item.listing.title || 'Untitled'}</h2>
              <p class="text-xs text-slate-500">{item.listing.price.amount} {item.listing.price.currency} · {item.listing.status}</p>
            </div>
            <div class="flex gap-2">
              <a
                href="/create?draft={item.listing.id}"
                class="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onclick={() => startEditing(item.listing)}
              >
                Edit
              </a>
              {#if item.listing.status === 'active'}
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onclick={() => markSold(item.listing)}
                >
                  Mark sold
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</AuthGate>
