<script lang="ts">
  import { onDestroy } from 'svelte';

  let {
    sources = [],
    alt,
    class: className = ''
  }: {
    sources: string[];
    alt: string;
    class?: string;
  } = $props();

  let loadedUrl = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let requestId = 0;
  let controllers: AbortController[] = [];

  function uniqueSources(values: string[]): string[] {
    return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
  }

  function cancelPendingRequests(): void {
    for (const controller of controllers) {
      controller.abort();
    }
    controllers = [];
  }

  function revokeLoadedUrl(): void {
    if (loadedUrl) {
      URL.revokeObjectURL(loadedUrl);
      loadedUrl = null;
    }
  }

  async function loadBestImage(candidateUrls: string[], token: number): Promise<void> {
    cancelPendingRequests();
    revokeLoadedUrl();
    error = null;

    if (candidateUrls.length === 0) {
      loading = false;
      error = 'No image available.';
      return;
    }

    loading = true;
    const localControllers: AbortController[] = [];
    controllers = localControllers;

    try {
      const objectUrl = await Promise.any(
        candidateUrls.map(async (url) => {
          const controller = new AbortController();
          localControllers.push(controller);
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) {
            throw new Error(`Image fetch failed with status ${response.status}`);
          }
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        })
      );

      if (token !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      loadedUrl = objectUrl;
      cancelPendingRequests();
    } catch (err) {
      if (token !== requestId) {
        return;
      }
      error = err instanceof Error ? err.message : 'Failed to load image.';
    } finally {
      if (token === requestId) {
        loading = false;
      }
    }
  }

  $effect(() => {
    const candidateUrls = uniqueSources(sources);
    const token = ++requestId;
    void loadBestImage(candidateUrls, token);

    return () => {
      if (token === requestId) {
        cancelPendingRequests();
        revokeLoadedUrl();
      }
    };
  });

  onDestroy(() => {
    requestId += 1;
    cancelPendingRequests();
    revokeLoadedUrl();
  });
</script>

{#if loadedUrl}
  <img src={loadedUrl} alt={alt} class={className} />
{:else if loading}
  <div class={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className}`}>
    Loading image…
  </div>
{:else if sources.length > 0}
  <img src={sources[0]} alt={alt} class={className} />
{:else}
  <div class={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className}`}>
    No image
  </div>
{/if}
