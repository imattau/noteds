import { createStore, del, get, getMany, keys, set } from 'idb-keyval';
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
  const stringKeys = allKeys.filter((key): key is string => typeof key === 'string');
  const fetchedDrafts = await getMany<ListingInput | undefined>(stringKeys, draftsStore);
  
  const drafts: ListingInput[] = [];
  for (const draft of fetchedDrafts) {
    if (draft !== undefined) {
      drafts.push(draft);
    }
  }
  return drafts;
}
