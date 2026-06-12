<script lang="ts">
  import { uploadToBlossomServers, type BlossomUploadResult } from '$lib/nostr/blossom';
  import { DEFAULT_BLOSSOM_SERVERS, getActiveBlossomServers } from '$lib/nostr/preferences';

  let {
    serverUrl,
    currentCount = 0,
    maxFiles = 8,
    onUpload
  }: {
    serverUrl?: string;
    currentCount?: number;
    maxFiles?: number;
    onUpload: (result: BlossomUploadResult) => void;
  } = $props();

  let uploading = $state(false);
  let error = $state<string | null>(null);
  let dragActive = $state(false);

  let remaining = $derived(Math.max(0, maxFiles - currentCount));

  function resolveServerUrls(): string[] {
    if (serverUrl) return [serverUrl];
    if (typeof window !== 'undefined') {
      const activeServers = getActiveBlossomServers();
      if (activeServers.length > 0) return activeServers;
    }
    return [...DEFAULT_BLOSSOM_SERVERS];
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    error = null;

    if (remaining === 0) {
      error = `You can add up to ${maxFiles} images.`;
      return;
    }

    const selected = files.slice(0, remaining);
    if (files.length > selected.length) {
      error = `Only ${remaining} more image${remaining === 1 ? '' : 's'} can be added.`;
    }

    uploading = true;
    try {
      for (const file of selected) {
        const result = await uploadToBlossomServers(file, resolveServerUrls());
        onUpload(result);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to upload image.';
    } finally {
      uploading = false;
    }
  }

  async function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    await uploadFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    if (uploading || remaining === 0) return;
    await uploadFiles(Array.from(e.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/')));
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
  }
</script>

<div
  role="group"
  aria-label="Image upload drop zone"
  class="flex flex-col gap-2 rounded-lg border border-dashed p-3 transition-colors {dragActive ? 'border-slate-900 bg-slate-100' : 'border-slate-300 bg-slate-50'}"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p class="text-sm font-medium text-slate-700">Add images</p>
      <p class="text-xs text-slate-500">
        {#if remaining > 0}
          {remaining} more image{remaining === 1 ? '' : 's'} can be added.
        {:else}
          You have reached the {maxFiles} image limit.
        {/if}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Drag and drop up to {maxFiles} images here, or choose files.
      </p>
    </div>
    <label class="inline-flex cursor-pointer items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
      <span>{uploading ? 'Uploading…' : 'Choose images'}</span>
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={uploading || remaining === 0}
        onchange={handleFileChange}
        class="sr-only"
      />
    </label>
  </div>
  {#if uploading}
    <p class="text-xs text-slate-500">Uploading…</p>
  {/if}
  {#if error}
    <p class="text-xs text-red-600">{error}</p>
  {/if}
</div>
