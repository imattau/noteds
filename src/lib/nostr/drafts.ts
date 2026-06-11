import { createStore, del, get, keys, set } from 'idb-keyval';
import type { ListingInput } from './listings';

const draftsStore = createStore('noteds-drafts', 'drafts');

export async function saveDraft(draft: ListingInput): Promise<void> {
  await set(draft.id, draft, draftsStore);
}

export async function getDraft(id: string): Promise<ListingInput | undefined> {
  return get<ListingInput>(id, draftsStore);
}

export async function deleteDraft(id: string): Promise<void> {
  await del(id, draftsStore);
}

export async function listDrafts(): Promise<ListingInput[]> {
  const allKeys = await keys(draftsStore);
  const drafts: ListingInput[] = [];
  for (const key of allKeys) {
    const draft = await get<ListingInput>(key as string, draftsStore);
    if (draft !== undefined) {
      drafts.push(draft);
    }
  }
  return drafts;
}
