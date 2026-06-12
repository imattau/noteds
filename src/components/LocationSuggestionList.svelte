<script lang="ts">
  import type { LocationSuggestion } from '$lib/nostr/location';

  let { suggestions, onSelect }: { suggestions: LocationSuggestion[]; onSelect: (suggestion: LocationSuggestion) => void } = $props();
</script>

<ul class="max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
  {#each suggestions as suggestion (suggestion.label)}
    <li>
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
        onclick={() => onSelect(suggestion)}
      >
        <span class="block font-medium text-slate-900">{suggestion.label}</span>
        <span class="block text-xs text-slate-500">{suggestion.country || suggestion.state || suggestion.city || suggestion.postcode}</span>
      </button>
    </li>
  {/each}
</ul>
