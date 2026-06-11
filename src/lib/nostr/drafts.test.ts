import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', () => {
  const stores = new Map<string, Map<string, unknown>>();

  function getStoreMap(storeId: unknown): Map<string, unknown> {
    const key = typeof storeId === 'string' ? storeId : 'default';
    let store = stores.get(key);
    if (!store) {
      store = new Map();
      stores.set(key, store);
    }
    return store;
  }

  return {
    createStore: (dbName: string, _storeName: string) => dbName,
    get: async (key: string, storeId?: unknown) => getStoreMap(storeId).get(key),
    set: async (key: string, value: unknown, storeId?: unknown) => {
      getStoreMap(storeId).set(key, value);
    },
    del: async (key: string, storeId?: unknown) => {
      getStoreMap(storeId).delete(key);
    },
    keys: async (storeId?: unknown) => Array.from(getStoreMap(storeId).keys())
  };
});

import { deleteDraft, getDraft, listDrafts, saveDraft } from './drafts';
import type { ListingInput } from './listings';

const sampleDraft: ListingInput = {
  id: 'draft-1',
  title: 'Old Couch',
  summary: 'Free to a good home',
  price: { amount: '0', currency: 'USD' },
  categories: ['furniture'],
  images: [],
  status: 'active',
  content: 'Comfy but worn.'
};

describe('drafts persistence', () => {
  beforeEach(async () => {
    for (const draft of await listDrafts()) {
      await deleteDraft(draft.id);
    }
  });

  it('saves and retrieves a draft by id', async () => {
    await saveDraft(sampleDraft);
    expect(await getDraft('draft-1')).toEqual(sampleDraft);
  });

  it('returns undefined for a missing draft', async () => {
    expect(await getDraft('does-not-exist')).toBeUndefined();
  });

  it('deletes a draft', async () => {
    await saveDraft(sampleDraft);
    await deleteDraft('draft-1');
    expect(await getDraft('draft-1')).toBeUndefined();
  });

  it('lists all saved drafts', async () => {
    const second: ListingInput = { ...sampleDraft, id: 'draft-2', title: 'Lamp' };
    await saveDraft(sampleDraft);
    await saveDraft(second);
    const all = await listDrafts();
    expect(all.map((draft) => draft.id).sort()).toEqual(['draft-1', 'draft-2']);
  });

  it('returns an empty array when no drafts exist', async () => {
    expect(await listDrafts()).toEqual([]);
  });
});
