<script lang="ts">
  import { nip19 } from 'nostr-tools';
  import { completePasskeySession, logout, account } from '$lib/nostr/signer';
  import { importPasskeyIdentityFromNsec, registerPasskeyIdentity } from '$lib/nostr/passkeyIdentity';
  import { sanitizeRelayUrl } from '$lib/nostr/security';
  import { DEFAULT_RELAYS, getActiveRelays, getCustomRelays, setCustomRelays } from '$lib/nostr/relays';

  const DEFAULT_BLOSSOM_SERVER = 'https://blossom.primal.net';

  let authError = $state<string | null>(null);
  let registering = $state(false);
  let importing = $state(false);
  let nsecInput = $state('');

  let relays = $state<string[]>(getCustomRelays());
  let newRelayUrl = $state('');
  let relayError = $state<string | null>(null);

  let blossomServer = $state('');

  $effect(() => {
    if (typeof window !== 'undefined') {
      blossomServer = localStorage.getItem('noteds:blossom-server') ?? '';
    }
  });

  function saveBlossomServer() {
    if (typeof window === 'undefined') return;
    if (blossomServer.trim()) {
      localStorage.setItem('noteds:blossom-server', blossomServer.trim());
    } else {
      localStorage.removeItem('noteds:blossom-server');
    }
  }

  async function handleRegister() {
    authError = null;
    registering = true;
    try {
      const { secretKey, pubkey } = await registerPasskeyIdentity();
      await completePasskeySession(secretKey, pubkey);
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to register passkey identity.';
    } finally {
      registering = false;
    }
  }

  async function handleImport() {
    authError = null;
    importing = true;
    try {
      const { secretKey, pubkey } = await importPasskeyIdentityFromNsec(nsecInput);
      await completePasskeySession(secretKey, pubkey);
      nsecInput = '';
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Failed to import identity.';
    } finally {
      importing = false;
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
</script>

<h1 class="text-2xl font-semibold">Settings</h1>

<section class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
  <h2 class="text-lg font-semibold">Account</h2>

  {#if $account}
    <div class="mt-2 flex items-center gap-3">
      {#if $account.metadata?.picture}
        <img src={$account.metadata.picture} alt="" class="h-10 w-10 rounded-full object-cover" />
      {/if}
      <div>
        <p class="text-sm font-medium text-slate-900">{$account.metadata?.name || $account.metadata?.display_name || 'Anonymous'}</p>
        <p class="text-xs text-slate-500">{nip19.npubEncode($account.pubkey)}</p>
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
      <button
        type="button"
        class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        onclick={handleRegister}
        disabled={registering}
      >
        {registering ? 'Registering…' : 'Register new passkey identity'}
      </button>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="nsec1… or hex secret key"
          class="block w-full rounded-md border-slate-300 shadow-sm sm:max-w-sm sm:text-sm"
          bind:value={nsecInput}
        />
        <button
          type="button"
          class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onclick={handleImport}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import from nsec'}
        </button>
      </div>
    </div>
  {/if}

  {#if authError}
    <p class="mt-2 text-sm text-red-600">{authError}</p>
  {/if}
</section>

<section class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
  <h2 class="text-lg font-semibold">Relays</h2>
  <p class="mt-1 text-xs text-slate-500">Active relays (defaults + custom):</p>
  <ul class="mt-1 flex flex-col gap-1 text-sm text-slate-700">
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
</section>

<section class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
  <h2 class="text-lg font-semibold">Image uploads (Blossom)</h2>
  <label for="blossom-server" class="mt-2 block text-sm font-medium text-slate-700">Server URL</label>
  <input
    id="blossom-server"
    type="text"
    placeholder={DEFAULT_BLOSSOM_SERVER}
    class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:max-w-sm sm:text-sm"
    bind:value={blossomServer}
    onblur={saveBlossomServer}
  />
</section>
