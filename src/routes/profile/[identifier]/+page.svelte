<script lang="ts">
  import AuthGate from '$components/AuthGate.svelte';
  import ListingCard from '$components/ListingCard.svelte';
  import { loadNostrUser, type NostrUser } from '$lib/nostr/metadata';
  import { loadAuthoredListings, type AuthoredListing } from '$lib/nostr/authoredListings';
  import {
    loadSellerReviews,
    parseSellerReviewEvent,
    publishSellerReview,
    SELLER_REVIEW_KIND,
    type SellerReview
  } from '$lib/nostr/reviews';
  import { account } from '$lib/nostr/signer';

  let { data }: { data: { pubkey: string; npub: string } } = $props();

  let seller = $state<NostrUser | null>(null);
  let listings = $state<AuthoredListing[]>([]);
  let reviews = $state<SellerReview[]>([]);
  let reviewerCache = $state<Record<string, NostrUser>>({});
  let activeTab = $state<'listings' | 'reviews'>('listings');
  let loadingListings = $state(true);
  let loadingReviews = $state(true);
  let loadingProfile = $state(true);
  let loadError = $state<string | null>(null);
  let reviewText = $state('');
  let reviewRating = $state('5');
  let anonymousReview = $state(false);
  let reviewSubmitting = $state(false);
  let reviewResult = $state<'success' | 'error' | null>(null);
  let reviewError = $state<string | null>(null);

  const sellerLabel = $derived(seller?.metadata?.display_name || seller?.metadata?.name || data.npub);
  const activeListings = $derived(
    listings.filter((item) => item.listing.status === 'active')
  );

  function initials(label: string): string {
    const parts = label
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 0) return 'NP';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function reviewStars(rating: number): string {
    return `${rating}/5`;
  }

  async function loadProfile(pubkey: string) {
    loadingProfile = true;
    loadError = null;
    try {
      const user = await loadNostrUser(pubkey);
      seller = user;
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to load seller profile.';
    } finally {
      loadingProfile = false;
    }
  }

  async function loadListings(pubkey: string) {
    loadingListings = true;
    loadError = null;
    try {
      listings = await loadAuthoredListings(pubkey);
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to load seller listings.';
    } finally {
      loadingListings = false;
    }
  }

  async function loadReviews(pubkey: string) {
    loadingReviews = true;
    loadError = null;
    try {
      const loadedReviews = await loadSellerReviews(pubkey);
      reviews = loadedReviews;

      const uniqueReviewers = [...new Set(loadedReviews.map((review) => review.reviewerPubkey))];
      const loadedUsers = await Promise.all(uniqueReviewers.map((pubkey) => loadNostrUser(pubkey)));
      reviewerCache = Object.fromEntries(loadedUsers.map((user) => [user.pubkey, user]));
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to load seller reviews.';
    } finally {
      loadingReviews = false;
    }
  }

  async function submitReview() {
    if (!reviewText.trim()) return;

    reviewSubmitting = true;
    reviewResult = null;
    reviewError = null;
    try {
      const event = await publishSellerReview({
        id: crypto.randomUUID(),
        sellerPubkey: data.pubkey,
        rating: Number.parseInt(reviewRating, 10),
        content: reviewText
      }, { anonymous: anonymousReview });

      const review = parseSellerReviewEvent(event);
      if (review) {
        reviews = [review, ...reviews];
        if (review.anonymous) {
          reviewerCache = {
            ...reviewerCache,
            [review.reviewerPubkey]: {
              pubkey: review.reviewerPubkey,
              npub: review.reviewerPubkey,
              metadata: {
                name: 'Anonymous',
                display_name: 'Anonymous'
              }
            }
          };
        } else {
          void loadNostrUser(review.reviewerPubkey).then((user) => {
            reviewerCache = { ...reviewerCache, [user.pubkey]: user };
          });
        }
      }

      reviewText = '';
      reviewRating = '5';
      anonymousReview = false;
      reviewResult = 'success';
    } catch (error) {
      reviewResult = 'error';
      reviewError = error instanceof Error ? error.message : 'Failed to post review.';
    } finally {
      reviewSubmitting = false;
    }
  }

  $effect(() => {
    let cancelled = false;

    if (!data.pubkey) {
      return;
    }

    void (async () => {
      await Promise.all([loadProfile(data.pubkey), loadListings(data.pubkey), loadReviews(data.pubkey)]);
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<svelte:head>
  <title>Seller profile - noteds</title>
</svelte:head>

<div class="space-y-6">
  {#if loadError}
    <div class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</div>
  {/if}

  <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-8 text-white">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
        {#if seller?.metadata?.picture}
          <img src={seller.metadata.picture} alt="" class="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/20" />
        {:else}
          <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-xl font-semibold">
            {initials(sellerLabel)}
          </div>
        {/if}

        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Seller profile</p>
          <h1 class="truncate text-3xl font-semibold">{sellerLabel}</h1>
          <p class="mt-2 break-all text-sm text-white/70">{data.npub}</p>
        </div>
      </div>
    </div>

    <div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div class="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
        <button
          type="button"
          class={`rounded-full px-4 py-2 text-sm font-medium transition ${
            activeTab === 'listings'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onclick={() => (activeTab = 'listings')}
        >
          Listings
          <span class="ml-1 text-xs text-slate-400">({activeListings.length})</span>
        </button>
        <button
          type="button"
          class={`rounded-full px-4 py-2 text-sm font-medium transition ${
            activeTab === 'reviews'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onclick={() => (activeTab = 'reviews')}
        >
          Reviews
          <span class="ml-1 text-xs text-slate-400">({reviews.length})</span>
        </button>
      </div>
    </div>

    <div class="p-4 sm:p-6">
      {#if loadingProfile && loadingListings && loadingReviews}
        <p class="text-sm text-slate-500">Loading profile…</p>
      {:else if activeTab === 'listings'}
        {#if loadingListings}
          <p class="text-sm text-slate-500">Loading seller listings…</p>
        {:else if activeListings.length === 0}
          <p class="text-sm text-slate-500">This seller has no active listings right now.</p>
        {:else}
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each activeListings as item (item.listing.id)}
              <ListingCard listing={item.listing} pubkey={data.pubkey} created_at={item.created_at} />
            {/each}
          </div>
        {/if}
      {:else}
        <div class="space-y-5">
          <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-slate-900">Leave a review</h2>
                <p class="mt-1 text-sm text-slate-500">Share a short note about the seller and rate the experience.</p>
              </div>
              <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Kind {SELLER_REVIEW_KIND}
              </span>
            </div>

            <div class="mt-4 space-y-3">
              <label class="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                <input type="checkbox" class="mt-1 rounded border-slate-300 text-slate-900" bind:checked={anonymousReview} />
                <span>
                  <span class="block font-medium text-slate-900">Post anonymously</span>
                  <span class="block text-slate-500">
                    Creates a throwaway Nostr keypair and publishes the review as <span class="font-medium">Anonymous</span>.
                  </span>
                </span>
              </label>

              {#if !anonymousReview}
                <AuthGate>
                  {#if $account?.pubkey === data.pubkey}
                    <p class="mt-4 text-sm text-slate-500">You cannot review your own seller profile.</p>
                  {:else}
                    <div class="space-y-3">
                      <label class="block">
                        <span class="mb-1 block text-sm font-medium text-slate-700">Rating</span>
                        <select
                          class="block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
                          bind:value={reviewRating}
                        >
                          <option value="5">5 - Excellent</option>
                          <option value="4">4 - Good</option>
                          <option value="3">3 - Okay</option>
                          <option value="2">2 - Rough</option>
                          <option value="1">1 - Poor</option>
                        </select>
                      </label>

                      <label class="block">
                        <span class="mb-1 block text-sm font-medium text-slate-700">Review</span>
                        <textarea
                          rows="4"
                          class="block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
                          placeholder="What was your experience like?"
                          bind:value={reviewText}
                          oninput={(event) => (reviewText = event.currentTarget.value)}
                        ></textarea>
                      </label>

                      {#if reviewResult === 'success'}
                        <p class="text-sm text-green-600">Review posted.</p>
                      {:else if reviewResult === 'error'}
                        <p class="text-sm text-red-600">{reviewError}</p>
                      {/if}

                      <div class="flex justify-end">
                        <button
                          type="button"
                          class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                          onclick={submitReview}
                          disabled={reviewSubmitting || !reviewText.trim()}
                        >
                          {reviewSubmitting ? 'Posting…' : 'Post review'}
                        </button>
                      </div>
                    </div>
                  {/if}
                </AuthGate>
              {:else}
                <div class="space-y-3">
                  <label class="block">
                    <span class="mb-1 block text-sm font-medium text-slate-700">Rating</span>
                    <select
                      class="block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
                      bind:value={reviewRating}
                    >
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Okay</option>
                      <option value="2">2 - Rough</option>
                      <option value="1">1 - Poor</option>
                    </select>
                  </label>

                  <label class="block">
                    <span class="mb-1 block text-sm font-medium text-slate-700">Review</span>
                    <textarea
                      rows="4"
                      class="block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"
                      placeholder="What was your experience like?"
                      bind:value={reviewText}
                      oninput={(event) => (reviewText = event.currentTarget.value)}
                    ></textarea>
                  </label>

                  {#if reviewResult === 'success'}
                    <p class="text-sm text-green-600">Review posted.</p>
                  {:else if reviewResult === 'error'}
                    <p class="text-sm text-red-600">{reviewError}</p>
                  {/if}

                  <div class="flex justify-end">
                    <button
                      type="button"
                      class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      onclick={submitReview}
                      disabled={reviewSubmitting || !reviewText.trim()}
                    >
                      {reviewSubmitting ? 'Posting…' : 'Post review'}
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          </section>

          {#if loadingReviews}
            <p class="text-sm text-slate-500">Loading reviews…</p>
          {:else if reviews.length === 0}
            <p class="text-sm text-slate-500">No reviews yet.</p>
          {:else}
            <div class="space-y-3">
              {#each reviews as review (review.eventId)}
                {@const reviewer = reviewerCache[review.reviewerPubkey]}
                <article
                  class={`rounded-2xl border p-4 shadow-sm ${
                    review.anonymous
                      ? 'border-amber-200 bg-amber-50/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-3">
                      {#if reviewer?.metadata?.picture}
                        <img src={reviewer.metadata.picture} alt="" class="h-10 w-10 rounded-full object-cover" />
                      {:else}
                        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                          {initials(reviewer?.metadata?.display_name || reviewer?.metadata?.name || reviewer?.npub || review.reviewerPubkey)}
                        </div>
                      {/if}
                      <div>
                        <p class="text-sm font-semibold text-slate-900">
                          {review.anonymous
                            ? 'Anonymous'
                            : reviewer?.metadata?.display_name || reviewer?.metadata?.name || reviewer?.npub || review.reviewerPubkey}
                        </p>
                        <p class="text-xs text-slate-500">{review.anonymous ? 'Anonymous review' : `Rating ${reviewStars(review.rating)}`}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      {#if review.anonymous}
                        <span class="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          Anonymous
                        </span>
                      {/if}
                      <p class="text-xs text-slate-400">{new Date(review.created_at * 1000).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <p class="mt-3 whitespace-pre-wrap text-sm text-slate-700">{review.content}</p>
                </article>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</div>
