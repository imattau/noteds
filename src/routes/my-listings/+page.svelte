<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthGate from '$components/AuthGate.svelte';
  import { account, signer } from '$lib/nostr/signer';
  import { eventStore, relayPool } from '$lib/nostr/runtime';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { buildListingEvent, parseListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { deleteDraft, saveDraft } from '$lib/nostr/drafts';
  import type { NostrEvent } from 'nostr-tools';
  import {
    loadOwnedListingIds,
    OWNED_LISTINGS_LOAD_TIMEOUT_MS,
    removeOwnedListingId,
    replaceOwnedListingIds,
    upsertOwnedListingId
  } from '$lib/nostr/ownedListings';
  import { collectEvents } from '$lib/nostr/requestEvents';

  interface OwnedListing {
    listing: ListingInput;
    created_at: number;
    eventId: string;
  }

  let listings = $state<OwnedListing[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function loadAuthoredListings(pubkey: string): Promise<OwnedListing[]> {
    const events = await collectEvents(
      relayPool.request(getActiveRelays(), { kinds: [30402], authors: [pubkey] }),
      OWNED_LISTINGS_LOAD_TIMEOUT_MS
    );

    const dTagValues = new Set<string>();
    for (const event of events) {
      dTagValues.add(parseListingEvent(event).id);
      eventStore.add(event);
    }

    const result: OwnedListing[] = [];
    for (const dTagValue of dTagValues) {
      const canonical = eventStore.getReplaceable(30402, pubkey, dTagValue);
      if (!canonical) continue;
      result.push({
        listing: parseListingEvent(canonical),
        created_at: canonical.created_at,
        eventId: canonical.id
      });
    }

    return result.sort((a, b) => b.created_at - a.created_at);
  }

  async function reloadListings(pubkey: string) {
    loading = true;
    error = null;

    try {
      const ownedIds = await loadOwnedListingIds(pubkey);
      if (ownedIds === null) {
        const authored = await loadAuthoredListings(pubkey);
        listings = authored;
        if (authored.length > 0) {
          await replaceOwnedListingIds(
            pubkey,
            authored.map((item) => item.listing.id)
          );
        }
        return;
      }

      if (ownedIds.length === 0) {
        listings = [];
        return;
      }

      const ownedSet = new Set(ownedIds);
      const events = await collectEvents(
        relayPool.request(getActiveRelays(), {
          kinds: [30402],
          authors: [pubkey],
          '#d': ownedIds
        }),
        OWNED_LISTINGS_LOAD_TIMEOUT_MS
      );

      for (const event of events) {
        eventStore.add(event);
      }

      const result: OwnedListing[] = [];
      for (const dTagValue of ownedSet) {
        const canonical = eventStore.getReplaceable(30402, pubkey, dTagValue);
        if (!canonical) continue;
        result.push({
          listing: parseListingEvent(canonical),
          created_at: canonical.created_at,
          eventId: canonical.id
        });
      }

      listings = result.sort((a, b) => b.created_at - a.created_at);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load your listings.';
      listings = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const pubkey = $account?.pubkey;
    if (!pubkey) {
      listings = [];
      loading = false;
      return;
    }

    void reloadListings(pubkey);
  });

  async function startEditing(listing: ListingInput) {
    await saveDraft(listing);
    await goto(`/create?draft=${encodeURIComponent(listing.id)}`);
  }

  async function markSold(item: OwnedListing) {
    error = null;
    const pubkey = $account?.pubkey;
    if (!pubkey) return;

    try {
      const updated: ListingInput = { ...item.listing, status: 'sold' };
      const template = buildListingEvent(updated, false);
      const event = await signer.signEvent(template);
      await relayPool.publish(getActiveRelays(), event);
      await upsertOwnedListingId(pubkey, updated.id);
      listings = listings.map((entry) =>
        entry.listing.id === updated.id ? { ...entry, listing: updated, created_at: event.created_at, eventId: event.id } : entry
      );
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark listing as sold.';
    }
  }

  async function deleteListing(item: OwnedListing) {
    error = null;
    const pubkey = $account?.pubkey;
    if (!pubkey) return;

    const confirmed = confirm(`Delete "${item.listing.title}"? This will remove it from your listings.`);
    if (!confirmed) return;

    try {
      const deleteEvent = await signer.signEvent({
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        content: 'deleted from my listings',
        tags: [['e', item.eventId], ['k', '30402']]
      });
      await relayPool.publish(getActiveRelays(), deleteEvent);
      await removeOwnedListingId(pubkey, item.listing.id);
      listings = listings.filter((entry) => entry.listing.id !== item.listing.id);
      await deleteDraft(item.listing.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete listing.';
    }
  }
</script>

<svelte:head>
  <title>My Listings - noteds</title>
</svelte:head>

<h1 class="text-2xl font-semibold">My Listings</h1>

<AuthGate>
  <div class="mt-4">
    {#if error}
      <p class="mb-3 text-sm text-red-600">{error}</p>
    {/if}

    {#if loading}
      <p class="text-sm text-slate-500">Loading your listings…</p>
    {:else if listings.length === 0}
      <p class="text-sm text-slate-500">You haven't published any listings yet.</p>
    {:else}
      <div class="grid grid-cols-1 gap-3">
        {#each listings as item (item.listing.id)}
          <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-base font-semibold text-slate-900">{item.listing.title || 'Untitled'}</h2>
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {item.listing.status}
                  </span>
                </div>
                <p class="mt-1 text-sm font-medium text-slate-700">
                  {item.listing.price.amount} {item.listing.price.currency}
                </p>
                {#if item.listing.location}
                  <p class="mt-1 text-sm text-slate-500">{item.listing.location}</p>
                {/if}
                <p class="mt-2 line-clamp-2 text-sm text-slate-600">{item.listing.summary}</p>

                {#if item.listing.categories.length > 0}
                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each item.listing.categories as category (category)}
                      <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{category}</span>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onclick={() => startEditing(item.listing)}
                >
                  Edit
                </button>
                {#if item.listing.status === 'active'}
                  <button
                    type="button"
                    class="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
                    onclick={() => markSold(item)}
                  >
                    Mark sold
                  </button>
                {/if}
                <button
                  type="button"
                  class="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  onclick={() => deleteListing(item)}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</AuthGate>
