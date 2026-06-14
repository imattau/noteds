<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { afterNavigate, goto } from '$app/navigation';
  import '../app.css';
  import type { NostrUser } from '$lib/nostr/metadata';

  let { children } = $props();

  let account = $state<NostrUser | null>(null);
  let accountUnsubscribe: (() => void) | null = null;
  let authError = $state<string | null>(null);
  let connecting = $state(false);
  let passkeyLoading = $state(false);

  onMount(() => {
    let disposed = false;
    void import('$lib/nostr/signer').then(({ account: accountStore }) => {
      if (disposed) {
        return;
      }
      accountUnsubscribe = accountStore.subscribe((value) => {
        account = value;
      });
    });

    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
      return () => {
        accountUnsubscribe?.();
      };
    }

    void navigator.serviceWorker.register(`${base}/service-worker.js`).catch((error) => {
      console.error('Failed to register service worker', error);
    });

    return () => {
      disposed = true;
      accountUnsubscribe?.();
    };
  });

  afterNavigate((navigation) => {
    const toRoute = navigation.to?.route?.id;
    const fromRoute = navigation.from?.route?.id;

    if (
      (toRoute === '/' || toRoute === '/category/[category]') &&
      fromRoute &&
      fromRoute !== '/' &&
      fromRoute !== '/category/[category]'
    ) {
      const params = new URLSearchParams(page.url.searchParams);
      let changed = false;
      for (const param of ['q', 'loc', 'geo']) {
        if (params.has(param)) {
          params.delete(param);
          changed = true;
        }
      }
      if (changed) {
        const query = params.toString();
        const pathname = page.url.pathname;
        void goto(query ? `${pathname}?${query}` : pathname, { replaceState: true, noScroll: true, keepFocus: true });
      }
    }
  });

  function getAccountInitials(): string {
    const label = account?.metadata?.display_name || account?.metadata?.name || account?.npub || '';
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
      const { signer } = await import('$lib/nostr/signer');
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
      const [{ completePasskeySession }, { unlockPasskeyIdentity, hasStoredPasskeyIdentity }] = await Promise.all([
        import('$lib/nostr/signer'),
        import('$lib/nostr/passkeyIdentity')
      ]);

      if (!hasStoredPasskeyIdentity()) {
        const { goto } = await import('$app/navigation');
        await goto(`${base}/settings?focus=passkey`);
        return;
      }

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
      <a href={base || '/'} class="flex items-center gap-3">
        <img
          src={`${base}/noteds-icon.svg`}
          alt="noteds"
          class="h-11 w-11 rounded-xl object-cover shadow-sm ring-1 ring-slate-200"
        />
        <div class="leading-tight">
          <p class="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Nostr classifieds</p>
          <p class="text-lg font-semibold text-slate-900">noteds</p>
        </div>
      </a>

      <div class="hidden sm:flex shrink-0 flex-col items-end gap-2">
        <div class="flex flex-wrap items-center justify-end gap-2">
          {#if account}
            <a
              href={`${base}/my-listings`}
              class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              My Listings
            </a>
            <a
              href={`${base}/create`}
              class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Create Listing
            </a>
            <a
              href={`${base}/messages`}
              class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Messages
            </a>
            <a
              href={`${base}/settings`}
              class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm transition hover:border-slate-300 hover:shadow"
              aria-label="Open account settings"
              title={account.metadata?.name || account.metadata?.display_name || 'Account settings'}
            >
              {#if account.metadata?.picture}
                <img
                  src={account.metadata.picture}
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
              href={`${base}/settings`}
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
            Waiting for a NIP-07 extension or NIP-46 bunker.
          </p>
        {/if}
        {#if authError}
          <p class="max-w-sm text-right text-xs text-rose-600">{authError}</p>
        {/if}
      </div>
    </div>
  </header>

  <main class="mx-auto max-w-5xl px-4 py-4 pb-24 sm:px-6 lg:px-8 sm:pb-8">
    {@render children()}
  </main>

  <nav class="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur-md sm:hidden">
    <div class="grid {account ? 'grid-cols-5' : 'grid-cols-4'} items-center justify-around py-2">
      <a
        href={base || '/'}
        class="flex flex-col items-center gap-1 text-center text-[10px] font-medium transition-colors {page.url.pathname === (base || '/') || page.url.pathname === (base + '/') || page.url.pathname.startsWith(base + '/category') || page.url.pathname.startsWith(base + '/listing') ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        <span>Home</span>
      </a>

      <a
        href={`${base}/create`}
        class="flex flex-col items-center gap-1 text-center text-[10px] font-medium transition-colors {page.url.pathname === `${base}/create` ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <span>Create</span>
      </a>

      {#if account}
        <a
          href={`${base}/messages`}
          class="flex flex-col items-center gap-1 text-center text-[10px] font-medium transition-colors {page.url.pathname.startsWith(`${base}/messages`) ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
          <span>Messages</span>
        </a>
      {/if}

      <a
        href={`${base}/my-listings`}
        class="flex flex-col items-center gap-1 text-center text-[10px] font-medium transition-colors {page.url.pathname === `${base}/my-listings` ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375 0 1 1-.75 0 .375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375 0 1 1-.75 0 .375 0 0 1 .75 0ZM3.75 17.25h.007v.008H3.75v-.008Zm.375 0a.375 0 1 1-.75 0 .375 0 0 1 .75 0Z" />
        </svg>
        <span>Listings</span>
      </a>

      <a
        href={`${base}/settings`}
        class="flex flex-col items-center gap-1 text-center text-[10px] font-medium transition-colors {page.url.pathname === `${base}/settings` ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}"
      >
        {#if account}
          {#if account.metadata?.picture}
            <img
              src={account.metadata.picture}
              alt=""
              class="h-6 w-6 rounded-full object-cover ring-1 ring-slate-200"
            />
          {:else}
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[9px] font-semibold uppercase tracking-wider text-white">
              {getAccountInitials()}
            </span>
          {/if}
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        {/if}
        <span>Account</span>
      </a>
    </div>
  </nav>
</div>
