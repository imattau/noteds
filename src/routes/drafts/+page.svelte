<script lang="ts">
  import { deleteDraft, listDrafts } from '$lib/nostr/drafts';
  import type { ListingInput } from '$lib/nostr/listings';

  let drafts = $state<ListingInput[]>([]);

  async function refresh() {
    drafts = await listDrafts();
  }

  $effect(() => {
    void refresh();
  });

  async function handleDelete(id: string) {
    await deleteDraft(id);
    await refresh();
  }
</script>

<h1 class="text-2xl font-semibold">Drafts</h1>

{#if drafts.length === 0}
  <p class="mt-4 text-sm text-slate-500">No drafts saved yet.</p>
{:else}
  <ul class="mt-4 flex flex-col gap-3">
    {#each drafts as draft (draft.id)}
      <li class="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">{draft.title || 'Untitled'}</h2>
          <p class="text-xs text-slate-500">{draft.summary}</p>
          {#if draft.categories.length > 0}
            <div class="mt-1 flex flex-wrap gap-1">
              {#each draft.categories as category (category)}
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{category}</span>
              {/each}
            </div>
          {/if}
        </div>
        <div class="flex gap-2">
          <a
            href="/create?draft={draft.id}"
            class="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </a>
          <button
            type="button"
            class="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
            onclick={() => handleDelete(draft.id)}
          >
            Delete
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}
