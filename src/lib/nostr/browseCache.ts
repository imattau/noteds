import type { BrowseItem } from './browseCounts';
import type { ListingFilters } from './searchParams';
import {
  getBrowseItemFromStore,
  loadBrowseCacheStore,
  queryBrowseCacheKeys,
  recordBrowseDeletions,
  resetBrowseCacheStoreForTests,
  upsertBrowseItems
} from './browseCacheStore';

const BROWSE_CACHE_SNAPSHOT_KEY = 'noteds:browse-cache-snapshot:v3';
const MAX_CACHED_ITEMS = 200;
const MAX_CACHED_DELETIONS = 500;
const SNAPSHOT_WRITE_DEBOUNCE_MS = 250;

let memoryCache: BrowseCacheRecord | null = null;
let snapshotWriteTimer: ReturnType<typeof setTimeout> | null = null;

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

function scheduleSnapshotWrite(record: BrowseCacheRecord) {
  if (!canUseStorage()) {
    return;
  }

  if (snapshotWriteTimer) {
    clearTimeout(snapshotWriteTimer);
  }

  snapshotWriteTimer = setTimeout(() => {
    snapshotWriteTimer = null;
    writeSnapshot(record);
  }, SNAPSHOT_WRITE_DEBOUNCE_MS);
}

export function flushBrowseCacheSnapshot(): void {
  if (snapshotWriteTimer) {
    clearTimeout(snapshotWriteTimer);
    snapshotWriteTimer = null;
  }

  if (memoryCache) {
    writeSnapshot(memoryCache);
  }
}

function filterRecordItems(record: BrowseCacheRecord, filters: BrowseQueryFilters, categoryScope?: string): BrowseCacheRecord {
  const items = record.items.filter((item) => {
    if (filters.since !== undefined && item.created_at < filters.since) {
      return false;
    }
    if (filters.keyword && !matchesKeyword(item, filters.keyword)) {
      return false;
    }
    if (!matchesLocationFilters(item, filters)) {
      return false;
    }
    if (categoryScope && !item.listing.categories.includes(categoryScope)) {
      return false;
    }
    if (filters.categories?.length && !matchesCategories(item, filters.categories)) {
      return false;
    }
    if (filters.subcategories?.length && !matchesSubcategories(item, filters.subcategories)) {
      return false;
    }
    return true;
  });

  return normalizeBrowseCache({
    items,
    deletedEventIds: record.deletedEventIds,
    updatedAt: record.updatedAt
  });
}

function getFallbackBrowseRecord(filters: BrowseQueryFilters, categoryScope?: string): BrowseCacheRecord {
  const record = memoryCache ?? readSnapshot();
  return filterRecordItems(record, filters, categoryScope);
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

  const indexed = await loadBrowseCacheStore();
  const normalizedIndexed = normalizeBrowseCache(
    {
      items: indexed.items,
      deletedEventIds: indexed.deletedEventIds,
      updatedAt: 0
    },
    MAX_CACHED_ITEMS
  );

  memoryCache =
    normalizedIndexed.items.length > 0 || normalizedIndexed.deletedEventIds.length > 0
      ? normalizedIndexed
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
  const geohash = item.listing.geohash;
  if (!geohash) {
    return false;
  }
  return geohash.startsWith(geohashPrefix) || geohashPrefix.startsWith(geohash);
}

// A geocoded location selection sets both `location` (display text) and
// `geohashPrefix`, but listings often populate only one of `location`/`geohash`.
// Requiring both would wrongly exclude items that match on just one dimension.
function matchesLocationFilters(item: BrowseItem, filters: BrowseQueryFilters) {
  if (!filters.location && !filters.geohashPrefix) {
    return true;
  }
  if (filters.location && matchesLocation(item, filters.location)) {
    return true;
  }
  if (filters.geohashPrefix && matchesGeohash(item, filters.geohashPrefix)) {
    return true;
  }
  return false;
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
  try {
    const [indexed, candidateKeys] = await Promise.all([loadBrowseCacheStore(), queryBrowseCacheKeys(filters, categoryScope)]);
    const deletedSet = new Set(indexed.deletedEventIds);
    const candidateKeySet = candidateKeys.length > 0 ? new Set(candidateKeys) : null;
    const items: BrowseItem[] = [];

    for (const item of indexed.items) {
      if (deletedSet.has(item.eventId)) {
        continue;
      }
      if (candidateKeySet && !candidateKeySet.has(getItemKey(item))) {
        continue;
      }
      if (filters.since !== undefined && item.created_at < filters.since) {
        continue;
      }
      if (filters.keyword && !matchesKeyword(item, filters.keyword)) {
        continue;
      }
      if (!matchesLocationFilters(item, filters)) {
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
      deletedEventIds: indexed.deletedEventIds,
      updatedAt: 0
    });
  } catch (error) {
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
    return getFallbackBrowseRecord(filters, categoryScope);
  }
}

export async function getCachedBrowseItem(pubkey: string, listingId: string): Promise<BrowseItem | null> {
  const itemKey = `${pubkey}:${listingId}`;

  if (memoryCache) {
    const found = memoryCache.items.find((item) => getItemKey(item) === itemKey);
    if (found) {
      return found;
    }
  }

  const item = await getBrowseItemFromStore(pubkey, listingId);
  return item ?? null;
}

export async function cacheBrowseItem(item: BrowseItem): Promise<void> {
  return cacheBrowseItems([item]);
}

// Batched form of cacheBrowseItem: writes all items together so the store can
// maintain indexes once per batch instead of one call per item.
export async function cacheBrowseItems(items: BrowseItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let current = await loadBrowseCache();
  try {
    await upsertBrowseItems(items);
  } catch (error) {
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
  }

  for (const item of items) {
    current = mergeBrowseItemIntoRecord(current, item);
  }
  primeBrowseCacheMemory(current);
  scheduleSnapshotWrite(current);
}

export async function cacheBrowseDeletions(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }

  const current = await loadBrowseCache();
  try {
    await recordBrowseDeletions(eventIds);
  } catch (error) {
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
  }

  const next = mergeBrowseDeletionsIntoRecord(current, eventIds);
  primeBrowseCacheMemory(next);
  scheduleSnapshotWrite(next);
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

export function resetBrowseCacheMemoryForTests() {
  memoryCache = null;
  resetBrowseCacheStoreForTests();
  if (snapshotWriteTimer) {
    clearTimeout(snapshotWriteTimer);
    snapshotWriteTimer = null;
  }
}
