<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { page } from '$app/state';
  import { completePasskeySession, logout, account } from '$lib/nostr/signer';
  import {
    hasStoredPasskeyIdentity,
    importPasskeyIdentityFromNsec,
    registerPasskeyIdentity,
    unlockPasskeyIdentity
  } from '$lib/nostr/passkeyIdentity';
  import { sanitizeRelayUrl } from '$lib/nostr/security';
  import {
    DEFAULT_BLOSSOM_SERVERS,
    getActiveBlossomServers,
    getCustomBlossomServers,
    hydratePreferencesFromNostr,
    sanitizeBlossomServerUrl,
    setCustomBlossomServers
  } from '$lib/nostr/preferences';
  import { DEFAULT_RELAYS, getActiveRelays, getCustomRelays, setCustomRelays } from '$lib/nostr/relays';

  let authError = $state<string | null>(null);
  let nsecInput = $state('');
  let hasPasskey = $state(hasStoredPasskeyIdentity());
  let passkeyBusy = $state(false);

  let relays = $state<string[]>(getCustomRelays());
  let newRelayUrl = $state('');
  let relayError = $state<string | null>(null);
  let relaysOpen = $state(false);

  let blossomServers = $state<string[]>(getCustomBlossomServers());
  let newBlossomServer = $state('');
  let blossomError = $state<string | null>(null);
  let blossomOpen = $state(false);

  function refreshPreferences() {
    relays = getCustomRelays();
    blossomServers = getCustomBlossomServers();
  }

  let passkeyBtn = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    if (page.url.searchParams.get('focus') === 'passkey' && passkeyBtn) {
      passkeyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      passkeyBtn.focus();
    }
  });

  async function handlePasskeySubmit() {
    authError = null;
    passkeyBusy = true;
    try {
      const trimmed = nsecInput.trim();
      const hasInput = trimmed.length > 0;
      const { secretKey, pubkey } = hasInput
        ? await importPasskeyIdentityFromNsec(trimmed)
        : hasPasskey
          ? await unlockPasskeyIdentity()
          : await registerPasskeyIdentity();

      await completePasskeySession(secretKey, pubkey);
      if (hasInput) {
        nsecInput = '';
      }
      hasPasskey = hasStoredPasskeyIdentity();
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to prepare passkey identity.';
    } finally {
      passkeyBusy = false;
    }
  }

  async function handleLogout() {
    authError = null;
    await logout();
  }

  function addRelay() {
    relayError = null;
    const sanitized = sanitizeRelayUrl(newRelayUrl);
    if (!sanitized) {
      relayError = 'Enter a valid ws:// or wss:// relay URL.';
      return;
    }
    if (relays.includes(sanitized)) {
      relayError = 'That relay is already in your list.';
      return;
    }
    relays = [...relays, sanitized];
    setCustomRelays(relays);
    newRelayUrl = '';
  }

  function removeRelay(url: string) {
    relays = relays.filter((relay) => relay !== url);
    setCustomRelays(relays);
  }

  function addBlossomServer() {
    blossomError = null;
    const sanitized = sanitizeBlossomServerUrl(newBlossomServer);
    if (!sanitized) {
      blossomError = 'Enter a valid https:// Blossom server URL.';
      return;
    }
    if (blossomServers.includes(sanitized)) {
      blossomError = 'That server is already in your list.';
      return;
    }
    blossomServers = [...blossomServers, sanitized];
    setCustomBlossomServers(blossomServers);
    newBlossomServer = '';
  }

  function removeBlossomServer(url: string) {
    blossomServers = blossomServers.filter((server) => server !== url);
    setCustomBlossomServers(blossomServers);
  }

  async function refreshFromNostrIfNeeded(pubkey: string) {
    if (!pubkey) return;
    await hydratePreferencesFromNostr(pubkey);
    refreshPreferences();
  }

  onMount(() => {
    refreshPreferences();
    const unsub = account.subscribe((acc) => {
      if (acc?.pubkey) {
        void refreshFromNostrIfNeeded(acc.pubkey);
      }
    });

    return () => {
      unsub();
    };
  });
</script>

<h1 class="text-2xl font-semibold">Settings</h1>

<section class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
  <h2 class="text-lg font-semibold">Account</h2>

  {#if $account}
    <div class="mt-2 flex items-center gap-3 min-w-0">
      {#if $account.metadata?.picture}
        <img src={$account.metadata.picture} alt="" class="h-10 w-10 rounded-full object-cover shrink-0" />
      {/if}
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-slate-900">{$account.metadata?.name || $account.metadata?.display_name || $account.npub}</p>
        <p class="break-all text-xs text-slate-500">{nip19.npubEncode($account.pubkey)}</p>
      </div>
    </div>
    <button
      type="button"
      class="mt-3 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      onclick={handleLogout}
    >
      Logout
    </button>
  {:else}
    <p class="mt-2 text-sm text-slate-500">No account connected on this device.</p>
    <div class="mt-3 flex flex-col gap-3">
      <label class="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" for="nsec-input">
        Optional existing nsec
      </label>
      <input
        id="nsec-input"
        type="text"
        placeholder="nsec1… or hex secret key"
        class="block w-full rounded-md border-slate-300 shadow-sm sm:max-w-sm sm:text-sm"
        bind:value={nsecInput}
      />
      <button
        bind:this={passkeyBtn}
        type="button"
        class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 focus:ring-4 focus:ring-slate-300 focus:outline-none"
        onclick={handlePasskeySubmit}
        disabled={passkeyBusy}
      >
        {passkeyBusy
          ? 'Working…'
          : nsecInput.trim()
            ? 'Create passkey from nsec'
            : hasPasskey
              ? 'Unlock passkey'
              : 'Create new passkey'}
      </button>
      <p class="text-xs text-slate-500">
        Leave the key empty to create a new Nostr keypair, or paste an existing `nsec` to move it into a passkey on this device.
      </p>
    </div>
  {/if}

  {#if authError}
    <p class="mt-2 text-sm text-red-600">{authError}</p>
  {/if}
</section>

<details class="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" bind:open={relaysOpen}>
  <summary class="cursor-pointer list-none">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Relays</h2>
        <p class="mt-1 text-xs text-slate-500">Your relay list stays out of the way until you need to edit it.</p>
      </div>
      <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
        {relaysOpen ? 'Hide' : 'Show'}
      </span>
    </div>
  </summary>

  <div class="pt-4">
    <p class="text-xs text-slate-500">Active relays (your Nostr list when available, otherwise local defaults + custom):</p>
    <ul class="mt-2 flex flex-col gap-1 text-sm text-slate-700">
      {#each getActiveRelays() as relay (relay)}
        <li class="flex items-center justify-between rounded-md border border-slate-100 px-2 py-1">
          <span>{relay}</span>
          {#if !DEFAULT_RELAYS.includes(relay)}
            <button type="button" class="text-xs text-red-600 hover:underline" onclick={() => removeRelay(relay)}>
              Remove
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        placeholder="wss://relay.example.com"
        class="block w-full rounded-md border-slate-300 shadow-sm sm:max-w-sm sm:text-sm"
        bind:value={newRelayUrl}
      />
      <button
        type="button"
        class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={addRelay}
      >
        Add relay
      </button>
    </div>
    {#if relayError}
      <p class="mt-2 text-sm text-red-600">{relayError}</p>
    {/if}
  </div>
</details>

<details class="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" bind:open={blossomOpen}>
  <summary class="cursor-pointer list-none">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Image uploads (Blossom)</h2>
        <p class="mt-1 text-xs text-slate-500">Upload servers are tucked away until you need to change them.</p>
      </div>
      <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
        {blossomOpen ? 'Hide' : 'Show'}
      </span>
    </div>
  </summary>

  <div class="pt-4">
    <p class="text-xs text-slate-500">Active upload servers (your Nostr preference when available, otherwise local defaults + custom):</p>
    <ul class="mt-2 flex flex-col gap-1 text-sm text-slate-700">
      {#each getActiveBlossomServers() as server (server)}
        <li class="flex items-center justify-between rounded-md border border-slate-100 px-2 py-1">
          <span class="truncate">{server}</span>
          {#if !DEFAULT_BLOSSOM_SERVERS.includes(server)}
            <button type="button" class="text-xs text-red-600 hover:underline" onclick={() => removeBlossomServer(server)}>
              Remove
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        id="blossom-server"
        type="text"
        placeholder={DEFAULT_BLOSSOM_SERVERS[0]}
        class="block w-full rounded-md border-slate-300 shadow-sm sm:max-w-sm sm:text-sm"
        bind:value={newBlossomServer}
      />
      <button
        type="button"
        class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={addBlossomServer}
      >
        Add server
      </button>
    </div>
    {#if blossomError}
      <p class="mt-2 text-sm text-red-600">{blossomError}</p>
    {/if}
  </div>
</details>
