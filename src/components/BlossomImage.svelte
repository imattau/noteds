<script lang="ts">
  let {
    sources = [],
    alt,
    class: className = ''
  }: {
    sources: string[];
    alt: string;
    class?: string;
  } = $props();

  let currentIndex = $state(0);
  let loadedSourcesKey: string | null = null;

  function uniqueSources(values: string[]): string[] {
    return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
  }

  $effect(() => {
    const sourcesKey = uniqueSources(sources).join('\n');
    if (sourcesKey === loadedSourcesKey) {
      return;
    }
    loadedSourcesKey = sourcesKey;
    currentIndex = 0;
  });
</script>

{#if uniqueSources(sources).length > 0 && currentIndex < uniqueSources(sources).length}
  <img
    src={uniqueSources(sources)[currentIndex]}
    alt={alt}
    class={className}
    loading="lazy"
    decoding="async"
    onerror={() => (currentIndex += 1)}
  />
{:else}
  <div class={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className}`}>
    No image
  </div>
{/if}
