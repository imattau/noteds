<script lang="ts">
  import { base } from '$app/paths';
  import { account, hasActiveSigner, signer } from '$lib/nostr/signer';

  let { children } = $props();

  let connecting = $state(false);
  let error = $state<string | null>(null);

  let authed = $derived($account !== null || hasActiveSigner());

  async function connect() {
    connecting = true;
    error = null;
    try {
      await signer.getPublicKey();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to connect to a Nostr signer.';
    } finally {
      connecting = false;
    }
  }
</script>

{#if authed}
  {@render children()}
{:else}
  <div class="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-6 text-center">
    <p class="text-sm text-slate-600">Connect a Nostr account to continue.</p>
    <button
      type="button"
      class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      onclick={connect}
      disabled={connecting}
    >
      {connecting ? 'Connecting…' : 'Connect'}
    </button>
    {#if error}
      <p class="text-sm text-red-600">{error}</p>
    {/if}
    <p class="text-xs text-slate-400">
      Set up a passkey identity, or use a NIP-07 extension / NIP-46 bunker, in
      <a href={`${base}/settings`} class="underline">Settings</a>.
    </p>
  </div>
{/if}
