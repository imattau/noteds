import Dexie, { type Table } from 'dexie';
import type { BrowseItem } from './browseCounts';
import type { BrowseQueryFilters } from './browseCache';

interface StoredBrowseItem extends BrowseItem {
  itemKey: string;
}

interface EventIndexRow {
  eventId: string;
  itemKey: string;
}

interface IndexRow {
  indexKey: string;
  itemKey: string;
}

interface DeletedRow {
  eventId: string;
}

class BrowseCacheDexie extends Dexie {
  items!: Table<StoredBrowseItem, string>;
  eventIndex!: Table<EventIndexRow, string>;
  categoryIndex!: Table<IndexRow, [string, string]>;
  subcategoryIndex!: Table<IndexRow, [string, string]>;
  geohashIndex!: Table<IndexRow, [string, string]>;
  deletions!: Table<DeletedRow, string>;

  constructor() {
    super('noteds-browse-cache');
    this.version(1).stores({
      items: '&itemKey, pubkey, created_at, eventId',
      eventIndex: '&eventId, itemKey',
      categoryIndex: '[indexKey+itemKey], indexKey, itemKey',
      subcategoryIndex: '[indexKey+itemKey], indexKey, itemKey',
      geohashIndex: '[indexKey+itemKey], indexKey, itemKey',
      deletions: '&eventId'
    });
  }
}

let db: BrowseCacheDexie | null = null;
let openPromise: Promise<BrowseCacheDexie> | null = null;
let unavailable = false;

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && typeof IDBKeyRange !== 'undefined';
}

function getItemKey(item: BrowseItem): string {
  return `${item.pubkey}:${item.listing.id}`;
}

function getCategoryKeys(item: BrowseItem): string[] {
  return Array.from(new Set(item.listing.categories.filter((category) => typeof category === 'string' && category.length > 0)));
}

function getSubcategoryKeys(item: BrowseItem): string[] {
  return Array.from(
    new Set(
      (item.listing.subcategories ?? [])
        .map((subcategory) => `${subcategory.parent}::${subcategory.value}`)
        .filter((value) => value.length > 0)
    )
  );
}

function getGeohashPrefixes(geohash?: string): string[] {
  if (!geohash) {
    return [];
  }

  const prefixes: string[] = [];
  for (let index = 1; index <= geohash.length; index += 1) {
    prefixes.push(geohash.slice(0, index));
  }
  return prefixes;
}

async function getDb(): Promise<BrowseCacheDexie | null> {
  if (unavailable || !canUseIndexedDb()) {
    return null;
  }

  if (db) {
    return db;
  }

  if (!openPromise) {
    const instance = new BrowseCacheDexie();
    openPromise = instance
      .open()
      .then(() => {
        db = instance;
        return instance;
      })
      .catch((error) => {
        unavailable = true;
        throw error;
      });
  }

  try {
    return await openPromise;
  } catch {
    return null;
  }
}

function toStoredItem(item: BrowseItem): StoredBrowseItem {
  return {
    ...item,
    itemKey: getItemKey(item)
  };
}

async function deleteIndexesForItemKey(database: BrowseCacheDexie, itemKey: string): Promise<void> {
  await Promise.all([
    database.categoryIndex.where('itemKey').equals(itemKey).delete(),
    database.subcategoryIndex.where('itemKey').equals(itemKey).delete(),
    database.geohashIndex.where('itemKey').equals(itemKey).delete()
  ]);
}

async function addIndexesForItem(database: BrowseCacheDexie, item: BrowseItem, itemKey: string): Promise<void> {
  const categoryRows = getCategoryKeys(item).map((indexKey) => ({ indexKey, itemKey }));
  const subcategoryRows = getSubcategoryKeys(item).map((indexKey) => ({ indexKey, itemKey }));
  const geohashRows = getGeohashPrefixes(item.listing.geohash).map((indexKey) => ({ indexKey, itemKey }));

  await Promise.all([
    categoryRows.length > 0 ? database.categoryIndex.bulkPut(categoryRows) : Promise.resolve(),
    subcategoryRows.length > 0 ? database.subcategoryIndex.bulkPut(subcategoryRows) : Promise.resolve(),
    geohashRows.length > 0 ? database.geohashIndex.bulkPut(geohashRows) : Promise.resolve()
  ]);
}

function normalizeKeyRows(rows: IndexRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.itemKey).filter((value) => typeof value === 'string' && value.length > 0)));
}

export async function loadBrowseCacheStore(): Promise<{ items: BrowseItem[]; deletedEventIds: string[] }> {
  const database = await getDb();
  if (!database) {
    return { items: [], deletedEventIds: [] };
  }

  try {
    const [itemRows, deletedRows] = await Promise.all([database.items.toArray(), database.deletions.toArray()]);
    const deletedSet = new Set(deletedRows.map((row) => row.eventId));
    return {
      items: itemRows.filter((item) => !deletedSet.has(item.eventId)).map(({ itemKey: _itemKey, ...item }) => item),
      deletedEventIds: deletedRows.map((row) => row.eventId)
    };
  } catch (error) {
    unavailable = true;
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
    return { items: [], deletedEventIds: [] };
  }
}

export async function upsertBrowseItems(items: BrowseItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const database = await getDb();
  if (!database) {
    return;
  }

  try {
    for (const item of items) {
      const itemKey = getItemKey(item);
      const existing = await database.items.get(itemKey);
      if (existing) {
        await deleteIndexesForItemKey(database, itemKey);
        if (existing.eventId !== item.eventId) {
          await database.eventIndex.delete(existing.eventId);
        }
      }

      await database.items.put(toStoredItem(item));
      await database.eventIndex.put({ eventId: item.eventId, itemKey });
      await addIndexesForItem(database, item, itemKey);
    }
  } catch (error) {
    unavailable = true;
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
  }
}

export async function recordBrowseDeletions(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }

  const database = await getDb();
  if (!database) {
    return;
  }

  try {
    for (const eventId of eventIds) {
      const itemKeyRow = await database.eventIndex.get(eventId);
      if (itemKeyRow) {
        const item = await database.items.get(itemKeyRow.itemKey);
        if (item) {
          await deleteIndexesForItemKey(database, itemKeyRow.itemKey);
          await database.items.delete(itemKeyRow.itemKey);
        }
        await database.eventIndex.delete(eventId);
      }
      await database.deletions.put({ eventId });
    }
  } catch (error) {
    unavailable = true;
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
  }
}

export async function getBrowseItemFromStore(pubkey: string, listingId: string): Promise<BrowseItem | null> {
  const database = await getDb();
  if (!database) {
    return null;
  }

  const itemKey = `${pubkey}:${listingId}`;
  try {
    const item = await database.items.get(itemKey);
    if (!item) {
      return null;
    }
    const deleted = await database.deletions.get(item.eventId);
    if (deleted) {
      return null;
    }
    const { itemKey: _itemKey, ...browseItem } = item;
    return browseItem;
  } catch (error) {
    unavailable = true;
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
    return null;
  }
}

async function resolveIndexRows(database: BrowseCacheDexie, filters: BrowseQueryFilters, categoryScope?: string): Promise<string[][]> {
  const candidateSets: string[][] = [];
  const categories = categoryScope ? [categoryScope, ...(filters.categories ?? [])] : filters.categories ?? [];

  if (categories.length > 0) {
    for (const category of new Set(categories)) {
      candidateSets.push(normalizeKeyRows(await database.categoryIndex.where('indexKey').equals(category).toArray()));
    }
  }

  if (filters.subcategories?.length) {
    for (const subcategory of new Set(filters.subcategories)) {
      candidateSets.push(normalizeKeyRows(await database.subcategoryIndex.where('indexKey').equals(subcategory).toArray()));
    }
  }

  if (filters.geohashPrefix && !filters.location) {
    const candidateKeys = new Set<string>();
    for (const prefix of getGeohashPrefixes(filters.geohashPrefix)) {
      for (const row of await database.geohashIndex.where('indexKey').equals(prefix).toArray()) {
        candidateKeys.add(row.itemKey);
      }
    }
    candidateSets.push(Array.from(candidateKeys));
  }

  if (candidateSets.length === 0) {
    const items = await database.items.toArray();
    return [items.map((item) => item.itemKey)];
  }

  return candidateSets;
}

export async function queryBrowseCacheKeys(filters: BrowseQueryFilters, categoryScope?: string): Promise<string[]> {
  const database = await getDb();
  if (!database) {
    return [];
  }

  try {
    const candidateSets = await resolveIndexRows(database, filters, categoryScope);
    const intersection = candidateSets.reduce((current, next) => {
      if (current.length === 0 || next.length === 0) {
        return [];
      }
      const nextSet = new Set(next);
      return current.filter((key) => nextSet.has(key));
    });

    return Array.from(new Set(intersection));
  } catch (error) {
    unavailable = true;
    console.warn('Browse cache IndexedDB unavailable; falling back to snapshot cache.', error);
    return [];
  }
}

export function resetBrowseCacheStoreForTests(): void {
  unavailable = false;
  db = null;
  openPromise = null;
}
