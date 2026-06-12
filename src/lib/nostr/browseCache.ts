import { createStore, del, get, keys, set } from 'idb-keyval';
import type { BrowseItem } from './browseCounts';
import type { ListingFilters } from './searchParams';

const DB_NAME = 'noteds-browse-cache';
const ITEMS_STORE = createStore(DB_NAME, 'items');
const EVENT_INDEX_STORE = createStore(DB_NAME, 'event-index');
const CATEGORY_INDEX_STORE = createStore(DB_NAME, 'category-index');
const SUBCATEGORY_INDEX_STORE = createStore(DB_NAME, 'subcategory-index');
const GEOHASH_INDEX_STORE = createStore(DB_NAME, 'geohash-index');
const DELETIONS_STORE = createStore(DB_NAME, 'deletions');
const BROWSE_CACHE_SNAPSHOT_KEY = 'noteds:browse-cache-snapshot:v3';
const MAX_CACHED_ITEMS = 200;
const MAX_CACHED_DELETIONS = 500;

let memoryCache: BrowseCacheRecord | null = null;

export interface BrowseCacheRecord {
  items: BrowseItem[];
  deletedEventIds: string[];
  updatedAt: number;
}

export interface BrowseQueryFilters extends ListingFilters {
  since?: number;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function getItemKey(item: BrowseItem) {
  return `${item.pubkey}:${item.listing.id}`;
}

function sortAndClampItems(items: BrowseItem[], maxItems = Number.POSITIVE_INFINITY) {
  const dedupedItems = new Map<string, BrowseItem>();
  for (const item of items) {
    if (!item?.listing?.id || !item?.pubkey || !item?.eventId) {
      continue;
    }
    dedupedItems.set(getItemKey(item), item);
  }

  return Array.from(dedupedItems.values())
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, maxItems);
}

function normalizeDeletedEventIds(eventIds: string[]) {
  return Array.from(new Set(eventIds.filter((eventId) => typeof eventId === 'string' && eventId.length > 0))).slice(
    0,
    MAX_CACHED_DELETIONS
  );
}

export function normalizeBrowseCache(
  record: Partial<BrowseCacheRecord> | null | undefined,
  maxItems = Number.POSITIVE_INFINITY
): BrowseCacheRecord {
  return {
    items: sortAndClampItems(Array.isArray(record?.items) ? record.items : [], maxItems),
    deletedEventIds: normalizeDeletedEventIds(Array.isArray(record?.deletedEventIds) ? record.deletedEventIds : []),
    updatedAt: typeof record?.updatedAt === 'number' ? record.updatedAt : 0
  };
}

function readSnapshot(): BrowseCacheRecord {
  if (!canUseStorage()) {
    return { items: [], deletedEventIds: [], updatedAt: 0 };
  }

  const raw = localStorage.getItem(BROWSE_CACHE_SNAPSHOT_KEY);
  if (!raw) {
    return { items: [], deletedEventIds: [], updatedAt: 0 };
  }

  try {
    return normalizeBrowseCache(JSON.parse(raw) as Partial<BrowseCacheRecord>, MAX_CACHED_ITEMS);
  } catch {
    return { items: [], deletedEventIds: [], updatedAt: 0 };
  }
}

function writeSnapshot(record: BrowseCacheRecord) {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(BROWSE_CACHE_SNAPSHOT_KEY, JSON.stringify(normalizeBrowseCache(record, MAX_CACHED_ITEMS)));
}

async function getStringArray(store: ReturnType<typeof createStore>, key: string): Promise<string[]> {
  const values = await get<string[] | undefined>(key, store);
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

async function setStringArray(store: ReturnType<typeof createStore>, key: string, values: string[]): Promise<void> {
  const next = Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
  if (next.length === 0) {
    await del(key, store);
    return;
  }
  await set(key, next, store);
}

async function appendStringArray(store: ReturnType<typeof createStore>, key: string, value: string): Promise<void> {
  const current = await getStringArray(store, key);
  if (!current.includes(value)) {
    current.push(value);
    await setStringArray(store, key, current);
  }
}

async function removeStringArrayEntry(store: ReturnType<typeof createStore>, key: string, value: string): Promise<void> {
  const current = await getStringArray(store, key);
  const next = current.filter((entry) => entry !== value);
  await setStringArray(store, key, next);
}

function getCategoryKeys(item: BrowseItem) {
  return Array.from(new Set(item.listing.categories.filter((category) => typeof category === 'string' && category.length > 0)));
}

function getSubcategoryKeys(item: BrowseItem) {
  return Array.from(
    new Set(
      (item.listing.subcategories ?? [])
        .map((subcategory) => `${subcategory.parent}::${subcategory.value}`)
        .filter((value) => value.length > 0)
    )
  );
}

function getGeohashPrefixes(geohash?: string) {
  if (!geohash) {
    return [];
  }

  const prefixes: string[] = [];
  for (let index = 1; index <= geohash.length; index += 1) {
    prefixes.push(geohash.slice(0, index));
  }
  return prefixes;
}

async function readIndexedRecord(): Promise<BrowseCacheRecord> {
  try {
    const itemKeys = await keys(ITEMS_STORE);
    const deletedEventIds = await keys(DELETIONS_STORE);
    const items: BrowseItem[] = [];

    for (const key of itemKeys) {
      const item = await get<BrowseItem>(key as string, ITEMS_STORE);
      if (item && !deletedEventIds.includes(item.eventId)) {
        items.push(item);
      }
    }

    return normalizeBrowseCache({
      items,
      deletedEventIds: deletedEventIds.filter((eventId): eventId is string => typeof eventId === 'string'),
      updatedAt: 0
    });
  } catch {
    return { items: [], deletedEventIds: [], updatedAt: 0 };
  }
}

function mergeBrowseItemIntoRecord(record: BrowseCacheRecord, item: BrowseItem): BrowseCacheRecord {
  const itemKey = getItemKey(item);
  const items = record.items.filter((existing) => getItemKey(existing) !== itemKey);
  const deletedEventIds = record.deletedEventIds.filter((eventId) => eventId !== item.eventId);
  items.unshift(item);
  return normalizeBrowseCache({
    items,
    deletedEventIds,
    updatedAt: Date.now()
  });
}

function mergeBrowseDeletionsIntoRecord(record: BrowseCacheRecord, eventIds: string[]): BrowseCacheRecord {
  const deletedEventIds = normalizeDeletedEventIds([...record.deletedEventIds, ...eventIds]);
  const items = record.items.filter((item) => !deletedEventIds.includes(item.eventId));
  return normalizeBrowseCache({
    items,
    deletedEventIds,
    updatedAt: Date.now()
  });
}

async function pruneItemFromIndexes(item: BrowseItem, itemKey: string) {
  const oldCategoryKeys = getCategoryKeys(item);
  const oldSubcategoryKeys = getSubcategoryKeys(item);
  const oldGeohashKeys = getGeohashPrefixes(item.listing.geohash);

  for (const category of oldCategoryKeys) {
    await removeStringArrayEntry(CATEGORY_INDEX_STORE, category, itemKey);
  }
  for (const subcategory of oldSubcategoryKeys) {
    await removeStringArrayEntry(SUBCATEGORY_INDEX_STORE, subcategory, itemKey);
  }
  for (const geohashPrefix of oldGeohashKeys) {
    await removeStringArrayEntry(GEOHASH_INDEX_STORE, geohashPrefix, itemKey);
  }
}

async function writeIndexedRecordItem(item: BrowseItem) {
  const itemKey = getItemKey(item);
  const previous = await get<BrowseItem | undefined>(itemKey, ITEMS_STORE);
  await set(itemKey, item, ITEMS_STORE);
  if (previous && previous.eventId !== item.eventId) {
    await del(previous.eventId, EVENT_INDEX_STORE);
    await pruneItemFromIndexes(previous, itemKey);
  }

  await set(item.eventId, itemKey, EVENT_INDEX_STORE);

  for (const category of getCategoryKeys(item)) {
    await appendStringArray(CATEGORY_INDEX_STORE, category, itemKey);
  }
  for (const subcategory of getSubcategoryKeys(item)) {
    await appendStringArray(SUBCATEGORY_INDEX_STORE, subcategory, itemKey);
  }
  for (const geohashPrefix of getGeohashPrefixes(item.listing.geohash)) {
    await appendStringArray(GEOHASH_INDEX_STORE, geohashPrefix, itemKey);
  }
}

export function loadBrowseCacheSnapshot(): BrowseCacheRecord {
  const snapshot = readSnapshot();
  memoryCache = snapshot;
  return snapshot;
}

export async function loadBrowseCache(): Promise<BrowseCacheRecord> {
  if (memoryCache !== null) {
    return memoryCache;
  }

  const indexed = await readIndexedRecord();
  memoryCache = indexed.items.length > 0 || indexed.deletedEventIds.length > 0 || indexed.updatedAt > 0
    ? indexed
    : readSnapshot();
  return memoryCache;
}

export function mergeBrowseCaches(current: BrowseCacheRecord, incoming: BrowseCacheRecord): BrowseCacheRecord {
  const deletedEventIds = normalizeDeletedEventIds([...current.deletedEventIds, ...incoming.deletedEventIds]);
  const filteredCurrent = current.items.filter((item) => !deletedEventIds.includes(item.eventId));
  const filteredIncoming = incoming.items.filter((item) => !deletedEventIds.includes(item.eventId));
  return normalizeBrowseCache({
    items: [...filteredCurrent, ...filteredIncoming],
    deletedEventIds,
    updatedAt: Math.max(current.updatedAt, incoming.updatedAt)
  });
}

export function primeBrowseCacheMemory(record: BrowseCacheRecord) {
  memoryCache = normalizeBrowseCache(record);
}

async function resolveCandidateKeys(filters: BrowseQueryFilters, categoryScope?: string) {
  const candidateSets: string[][] = [];
  const categories = categoryScope ? [categoryScope, ...(filters.categories ?? [])] : filters.categories ?? [];

  if (categories.length > 0) {
    for (const category of new Set(categories)) {
      candidateSets.push(await getStringArray(CATEGORY_INDEX_STORE, category));
    }
  }

  if (filters.subcategories?.length) {
    for (const subcategory of new Set(filters.subcategories)) {
      candidateSets.push(await getStringArray(SUBCATEGORY_INDEX_STORE, subcategory));
    }
  }

  if (filters.geohashPrefix) {
    candidateSets.push(await getStringArray(GEOHASH_INDEX_STORE, filters.geohashPrefix));
  }

  if (candidateSets.length === 0) {
    return (await keys(ITEMS_STORE)).map((key) => key as string);
  }

  const intersection = candidateSets.reduce((current, next) => {
    if (current.length === 0 || next.length === 0) {
      return [];
    }
    const nextSet = new Set(next);
    return current.filter((key) => nextSet.has(key));
  });

  return Array.from(new Set(intersection));
}

function matchesKeyword(item: BrowseItem, keyword: string) {
  const needle = keyword.toLowerCase();
  return (
    item.listing.title.toLowerCase().includes(needle) ||
    item.listing.summary.toLowerCase().includes(needle) ||
    item.listing.content.toLowerCase().includes(needle) ||
    (item.listing.location ?? '').toLowerCase().includes(needle)
  );
}

function matchesLocation(item: BrowseItem, location: string) {
  const needle = location.toLowerCase();
  return (item.listing.location ?? '').toLowerCase().includes(needle);
}

function matchesGeohash(item: BrowseItem, geohashPrefix: string) {
  return item.listing.geohash?.startsWith(geohashPrefix) ?? false;
}

function matchesCategories(item: BrowseItem, categories: string[]) {
  return categories.every((category) => item.listing.categories.includes(category));
}

function matchesSubcategories(item: BrowseItem, subcategories: string[]) {
  return subcategories.every((entry) =>
    item.listing.subcategories?.some((subcategory) => `${subcategory.parent}::${subcategory.value}` === entry)
  );
}

export async function queryBrowseCache(filters: BrowseQueryFilters, categoryScope?: string): Promise<BrowseCacheRecord> {
  const candidateKeys = await resolveCandidateKeys(filters, categoryScope);
  const deletedEventIds = await keys(DELETIONS_STORE);
  const deletedSet = new Set(deletedEventIds.filter((eventId): eventId is string => typeof eventId === 'string'));
  const items: BrowseItem[] = [];

  for (const key of candidateKeys) {
    const item = await get<BrowseItem>(key, ITEMS_STORE);
    if (!item || deletedSet.has(item.eventId)) {
      continue;
    }
    if (filters.since !== undefined && item.created_at < filters.since) {
      continue;
    }
    if (filters.keyword && !matchesKeyword(item, filters.keyword)) {
      continue;
    }
    if (filters.location && !matchesLocation(item, filters.location)) {
      continue;
    }
    if (filters.geohashPrefix && !matchesGeohash(item, filters.geohashPrefix)) {
      continue;
    }
    if (categoryScope && !item.listing.categories.includes(categoryScope)) {
      continue;
    }
    if (filters.categories?.length && !matchesCategories(item, filters.categories)) {
      continue;
    }
    if (filters.subcategories?.length && !matchesSubcategories(item, filters.subcategories)) {
      continue;
    }
    items.push(item);
  }

  return normalizeBrowseCache({
    items,
    deletedEventIds: deletedEventIds.filter((eventId): eventId is string => typeof eventId === 'string'),
    updatedAt: 0
  });
}

export async function cacheBrowseItem(item: BrowseItem): Promise<void> {
  const current = await loadBrowseCache();
  await writeIndexedRecordItem(item);
  const next = mergeBrowseItemIntoRecord(current, item);
  primeBrowseCacheMemory(next);
  writeSnapshot(next);
}

export async function cacheBrowseDeletions(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }

  const current = await loadBrowseCache();
  for (const eventId of eventIds) {
    const itemKey = await get<string | undefined>(eventId, EVENT_INDEX_STORE);
    if (itemKey) {
      const item = await get<BrowseItem | undefined>(itemKey, ITEMS_STORE);
      if (item) {
        await pruneItemFromIndexes(item, itemKey);
        await del(itemKey, ITEMS_STORE);
      }
      await del(eventId, EVENT_INDEX_STORE);
    }
    await set(eventId, true, DELETIONS_STORE);
  }

  const next = mergeBrowseDeletionsIntoRecord(current, eventIds);
  primeBrowseCacheMemory(next);
  writeSnapshot(next);
}

export function resetBrowseCacheMemoryForTests() {
  memoryCache = null;
}
