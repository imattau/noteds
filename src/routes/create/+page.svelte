<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import AuthGate from '$components/AuthGate.svelte';
  import ListingForm from '$components/ListingForm.svelte';
  import { deleteDraft, getDraft, saveDraft } from '$lib/nostr/drafts';
  import { upsertOwnedListingId } from '$lib/nostr/ownedListings';
  import { buildListingEvent, type ListingInput } from '$lib/nostr/listings';
  import { getActiveRelays } from '$lib/nostr/relays';
  import { relayPool } from '$lib/nostr/runtime';
  import { signer } from '$lib/nostr/signer';

  let error = $state<string | null>(null);
  let initial = $state<ListingInput | undefined>(undefined);

  $effect(() => {
    const draftId = page.url.searchParams.get('draft');
    if (draftId) {
      void getDraft(draftId).then((draft) => {
        if (draft) {
          initial = draft;
        }
      });
    }
  });

  async function handleSubmit(input: ListingInput, action: 'draft' | 'publish') {
    error = null;
    try {
      if (action === 'draft') {
        await saveDraft(input);
        return;
      }

      const template = buildListingEvent(input, false);
      const event = await signer.signEvent(template);
      await relayPool.publish(getActiveRelays(), event);
      void upsertOwnedListingId(event.pubkey, input.id).catch((indexError) => {
        console.error('Failed to update owned listings index after publish', indexError);
      });
      await deleteDraft(input.id);
      await goto('/my-listings');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save listing.';
    }
  }
</script>

<h1 class="text-2xl font-semibold">Create Listing</h1>

<AuthGate>
  <div class="mt-4">
    {#if error}
      <p class="mb-2 text-sm text-red-600">{error}</p>
    {/if}
    {#key initial?.id}
      <ListingForm {initial} onSubmit={handleSubmit} />
    {/key}
  </div>
</AuthGate>
