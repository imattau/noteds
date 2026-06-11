<script lang="ts">
  import { uploadToBlossom } from '$lib/nostr/blossom';

  const DEFAULT_BLOSSOM_SERVER = 'https://blossom.primal.net';

  let {
    serverUrl,
    onUpload
  }: {
    serverUrl?: string;
    onUpload: (url: string) => void;
  } = $props();

  let uploading = $state(false);
  let error = $state<string | null>(null);

  function resolveServerUrl(): string {
    if (serverUrl) return serverUrl;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('noteds:blossom-server');
      if (stored) return stored;
    }
    return DEFAULT_BLOSSOM_SERVER;
  }

  async function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    error = null;
    uploading = true;
    try {
      const url = await uploadToBlossom(file, resolveServerUrl());
      onUpload(url);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to upload image.';
    } finally {
      uploading = false;
      input.value = '';
    }
  }
</script>

<div class="flex flex-col gap-1">
  <input type="file" accept="image/*" disabled={uploading} onchange={handleFileChange} class="text-sm" />
  {#if uploading}
    <p class="text-xs text-slate-500">Uploading…</p>
  {/if}
  {#if error}
    <p class="text-xs text-red-600">{error}</p>
  {/if}
</div>
