<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import '../app.css';
  import { completePasskeySession, account, signer } from '$lib/nostr/signer';
  import { unlockPasskeyIdentity } from '$lib/nostr/passkeyIdentity';

  let { children } = $props();

  let authError = $state<string | null>(null);
  let connecting = $state(false);
  let passkeyLoading = $state(false);

  onMount(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
      return;
    }

    void navigator.serviceWorker.register(`${base}/service-worker.js`).catch((error) => {
      console.error('Failed to register service worker', error);
    });
  });

  function getAccountInitials(): string {
    const label = $account?.metadata?.display_name || $account?.metadata?.name || $account?.npub || '';
    const letters = label
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (letters.length === 0) {
      return 'NP';
    }
    if (letters.length === 1) {
      return letters[0].slice(0, 2).toUpperCase();
    }
    return (letters[0][0] + letters[1][0]).toUpperCase();
  }

  async function connectWithNostr() {
    connecting = true;
    authError = null;
    try {
      await signer.getPublicKey();
    } catch (error) {
      authError = error instanceof Error ? error.message : 'Failed to connect with Nostr.';
    } finally {
      connecting = false;
    }
  }

  async function usePasskey() {
    passkeyLoading = true;
    authError = null;
    try {
      const { secretKey, pubkey } = await unlockPasskeyIdentity();
      await completePasskeySession(secretKey, pubkey);
    } catch (error) {
      authError = error instanceof Error ? error.message : 'Failed to unlock the passkey.';
    } finally {
      passkeyLoading = false;
    }
  }
</script>

<svelte:head>
  <title>noteds</title>
  <link rel="manifest" href={`${base}/manifest.webmanifest`} />
  <link rel="icon" href={`${base}/noteds-icon.svg`} />
  <link rel="apple-touch-icon" href={`${base}/noteds-logo.png`} />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="noteds" />
  <meta name="theme-color" content="#15345d" />
  <meta name="description" content="Nostr classifieds for listings, drafts, and direct messages." />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="noteds" />
  <meta property="og:description" content="Nostr classifieds for listings, drafts, and direct messages." />
  <meta property="og:image" content={`${base}/noteds-og.svg`} />
  <meta property="og:image:alt" content="noteds - Nostr classifieds" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="noteds" />
  <meta name="twitter:description" content="Nostr classifieds for listings, drafts, and direct messages." />
  <meta name="twitter:image" content={`${base}/noteds-og.svg`} />
</svelte:head>

<div class="min-h-screen bg-slate-50 text-slate-900">
  <header class="border-b border-slate-200 bg-white/90 backdrop-blur">
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
      <a href={`${base}/`} class="flex items-center gap-3">
        <img
          src={`${base}/noteds-logo.png`}
          alt="noteds"
          class="h-11 w-11 rounded-xl object-cover shadow-sm ring-1 ring-slate-200"
        />
        <div class="leading-tight">
          <p class="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Nostr classifieds</p>
          <p class="text-lg font-semibold text-slate-900">noteds</p>
        </div>
      </a>

      <div class="flex shrink-0 flex-col items-end gap-2">
        <div class="flex flex-wrap items-center justify-end gap-2">
          {#if $account}
            <a
              href="/my-listings"
              class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              My Listings
            </a>
            <a
              href="/create"
              class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Create Listing
            </a>
            <a
              href="/settings"
              class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm transition hover:border-slate-300 hover:shadow"
              aria-label="Open account settings"
              title={$account.metadata?.name || $account.metadata?.display_name || 'Account settings'}
            >
              {#if $account.metadata?.picture}
                <img
                  src={$account.metadata.picture}
                  alt=""
                  class="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200"
                />
              {:else}
                <span class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                  {getAccountInitials()}
                </span>
              {/if}
            </a>
          {:else}
            <a
              href="/settings"
              class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Settings
            </a>
            <button
              type="button"
              class="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              onclick={connectWithNostr}
              disabled={connecting || passkeyLoading}
            >
              {connecting ? 'Connecting via NIP-07/46…' : 'Connect with Nostr'}
            </button>
            <button
              type="button"
              class="rounded-full bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
              onclick={usePasskey}
              disabled={connecting || passkeyLoading}
            >
              {passkeyLoading ? 'Opening…' : 'Use Passkey'}
            </button>
          {/if}
        </div>
        {#if connecting}
          <p class="max-w-sm text-right text-xs text-slate-500">
            Waiting for a NIP-07 extension or window.nostr.js bridge.
          </p>
        {/if}
        {#if authError}
          <p class="max-w-sm text-right text-xs text-rose-600">{authError}</p>
        {/if}
      </div>
    </div>
  </header>

  <main class="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
    {@render children()}
  </main>
</div>
