import { edgeId, MemoryAdapter, PolyGraph } from '@0xx0lostcause0xx0/polypack';
import { BinaryStoreAdapter } from '@0xx0lostcause0xx0/polypack/persistence/opfs';
import type { GraphTransaction, PolyEdge, PolyNode } from '@0xx0lostcause0xx0/polypack';
import type { BrowseItem } from './browseCounts';
import type { BrowseQueryFilters } from './browseCache';

/** Shared graph nodes are reference-owned: removing a listing never removes them. */
export const BROWSE_EDGE = {
  CATEGORY: 'IN_CATEGORY',
  SUBCATEGORY: 'IN_SUBCATEGORY',
  GEOHASH: 'LOCATED_IN',
  AUTHOR: 'AUTHORED_BY'
} as const;

const LISTING_NODE_TYPE = 'listing';
const TOMBSTONE_NODE_TYPE = 'deleted-event';
const GRAPH_STORE_NAME = 'noteds-browse-graph';

interface ListingNodeData {
  item: BrowseItem;
  eventId: string;
  pubkey: string;
  created_at: number;
}

interface TombstoneNodeData {
  eventId: string;
}

let graph: PolyGraph | null = null;
let graphPromise: Promise<PolyGraph> | null = null;
let writeTail: Promise<void> = Promise.resolve();

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeTail.then(operation);
  writeTail = next.then(() => undefined, () => undefined);
  return next;
}

function hasOPFS(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

function listingNodeId(item: BrowseItem): string {
  return `listing:${item.pubkey}:${item.listing.id}`;
}

function categoryNodeId(category: string): string {
  return `category:${encodeURIComponent(category)}`;
}

function subcategoryNodeId(parent: string, value: string): string {
  return `subcategory:${encodeURIComponent(parent)}:${encodeURIComponent(value)}`;
}

function geohashNodeId(prefix: string): string {
  return `geohash:${prefix}`;
}

function getGeohashPrefixes(geohash?: string): string[] {
  if (!geohash) return [];
  return Array.from({ length: geohash.length }, (_, index) => geohash.slice(0, index + 1));
}

function nowForItem(item: BrowseItem): number {
  return Math.max(0, item.created_at * 1000);
}

function makeSharedNode(id: string, type: string, label: string): PolyNode {
  const now = Date.now();
  return { id, type, data: { label }, insertedAt: now, updatedAt: now };
}

async function getGraph(): Promise<PolyGraph> {
  if (graph) return graph;
  if (!graphPromise) {
    graphPromise = (async () => {
      const adapter = hasOPFS()
        ? new BinaryStoreAdapter({ storeDir: GRAPH_STORE_NAME })
        : new MemoryAdapter();
      const instance = new PolyGraph(adapter, 5000);
      await instance.warm();
      instance.defineIndex({ name: 'listing-event-id', nodeType: LISTING_NODE_TYPE, fields: ['eventId'] });
      instance.defineIndex({ name: 'listing-pubkey', nodeType: LISTING_NODE_TYPE, fields: ['pubkey'] });
      instance.defineIndex({ name: 'listing-created-at', nodeType: LISTING_NODE_TYPE, fields: ['created_at'] });
      graph = instance;
      return instance;
    })();
  }
  return graphPromise;
}

function itemFromNode(node: PolyNode): BrowseItem | null {
  const data = node.data as Partial<ListingNodeData>;
  return data.item && typeof data.item === 'object' ? data.item : null;
}

function tombstoneEventId(node: PolyNode): string | null {
  const data = node.data as Partial<TombstoneNodeData>;
  return typeof data.eventId === 'string' ? data.eventId : null;
}

type GraphMutator = Pick<PolyGraph, 'addNode'> & Pick<GraphTransaction, 'addEdge'>;

function addListingRelations(target: GraphMutator, item: BrowseItem) {
  const source = listingNodeId(item);
  for (const category of item.listing.categories) {
    const targetId = categoryNodeId(category);
    target.addNode(makeSharedNode(targetId, 'category', category));
    target.addEdge({
      id: edgeId(source, BROWSE_EDGE.CATEGORY, targetId),
      source,
      type: BROWSE_EDGE.CATEGORY,
      target: targetId,
      createdAt: Date.now(),
      data: { ownership: 'reference' }
    } satisfies PolyEdge);
  }
  for (const subcategory of item.listing.subcategories ?? []) {
    const targetId = subcategoryNodeId(subcategory.parent, subcategory.value);
    target.addNode(makeSharedNode(targetId, 'subcategory', `${subcategory.parent}::${subcategory.value}`));
    target.addEdge({
      id: edgeId(source, BROWSE_EDGE.SUBCATEGORY, targetId),
      source,
      type: BROWSE_EDGE.SUBCATEGORY,
      target: targetId,
      createdAt: Date.now(),
      data: { ownership: 'reference' }
    } satisfies PolyEdge);
  }
  for (const prefix of getGeohashPrefixes(item.listing.geohash)) {
    const targetId = geohashNodeId(prefix);
    target.addNode(makeSharedNode(targetId, 'geohash', prefix));
    target.addEdge({
      id: edgeId(source, BROWSE_EDGE.GEOHASH, targetId),
      source,
      type: BROWSE_EDGE.GEOHASH,
      target: targetId,
      createdAt: Date.now(),
      data: { ownership: 'reference' }
    } satisfies PolyEdge);
  }

  const sellerId = `seller:${item.pubkey}`;
  target.addNode(makeSharedNode(sellerId, 'seller', item.pubkey));
  target.addEdge({
    id: edgeId(source, BROWSE_EDGE.AUTHOR, sellerId),
    source,
    type: BROWSE_EDGE.AUTHOR,
    target: sellerId,
    createdAt: Date.now(),
    data: { ownership: 'reference' }
  } satisfies PolyEdge);
}

export async function loadBrowseCacheStore(): Promise<{ items: BrowseItem[]; deletedEventIds: string[] }> {
  const instance = await getGraph();
  const [listingNodes, tombstoneNodes] = await Promise.all([
    instance.queryPersisted().whereNodeType(LISTING_NODE_TYPE).toArray(),
    instance.queryPersisted().whereNodeType(TOMBSTONE_NODE_TYPE).toArray()
  ]);
  const deletedEventIds = tombstoneNodes
    .map(tombstoneEventId)
    .filter((eventId): eventId is string => eventId !== null);
  const deleted = new Set(deletedEventIds);
  const items = listingNodes
    .map(itemFromNode)
    .filter((item): item is BrowseItem => item !== null && !deleted.has(item.eventId));
  return { items, deletedEventIds };
}

/** Read the v1 Dexie stores without retaining Dexie as a runtime dependency. */
export async function loadLegacyBrowseCacheStore(): Promise<{ items: BrowseItem[]; deletedEventIds: string[] }> {
  if (typeof indexedDB === 'undefined') return { items: [], deletedEventIds: [] };

  return await new Promise((resolve) => {
    const request = indexedDB.open('noteds-browse-cache');
    request.onerror = () => resolve({ items: [], deletedEventIds: [] });
    request.onsuccess = () => {
      const database = request.result;
      const storeNames = Array.from(database.objectStoreNames);
      if (!storeNames.includes('items') || !storeNames.includes('deletions')) {
        database.close();
        resolve({ items: [], deletedEventIds: [] });
        return;
      }

      const transaction = database.transaction(['items', 'deletions'], 'readonly');
      const itemsRequest = transaction.objectStore('items').getAll();
      const deletionsRequest = transaction.objectStore('deletions').getAll();
      transaction.oncomplete = () => {
        const deletedEventIds = (deletionsRequest.result as Array<{ eventId?: unknown }>)
          .map((row) => row.eventId)
          .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0);
        const deleted = new Set(deletedEventIds);
        const items = (itemsRequest.result as Array<BrowseItem & { itemKey?: unknown }>)
          .map(({ itemKey: _itemKey, ...item }) => item)
          .filter((item) => typeof item.eventId === 'string' && !deleted.has(item.eventId));
        database.close();
        resolve({ items, deletedEventIds });
      };
      transaction.onerror = () => {
        database.close();
        resolve({ items: [], deletedEventIds: [] });
      };
    };
  });
}

export async function upsertBrowseItems(items: BrowseItem[]): Promise<void> {
  if (items.length === 0) return;
  await enqueueWrite(async () => {
    const instance = await getGraph();
    const edgeIds = new Map<string, string[]>();
    for (const item of items) {
      const id = listingNodeId(item);
      await instance.getNodeSafe(id);
      edgeIds.set(id, instance.getEdges(id).map((edge) => edgeId(id, edge.type, edge.target)));
    }

    await instance.transaction((tx) => {
      for (const item of items) {
        const id = listingNodeId(item);
        const existing = tx.getNode(id);
        for (const relationId of edgeIds.get(id) ?? []) tx.removeEdge(relationId);
        tx.addNode({
          id,
          type: LISTING_NODE_TYPE,
          data: { item, eventId: item.eventId, pubkey: item.pubkey, created_at: item.created_at },
          insertedAt: existing?.insertedAt ?? nowForItem(item),
          updatedAt: Date.now()
        });
        addListingRelations(tx, item);
      }
    });
    await instance.flush();
  });
}

export async function recordBrowseDeletions(eventIds: string[]): Promise<void> {
  const ids = Array.from(new Set(eventIds.filter((eventId) => typeof eventId === 'string' && eventId.length > 0)));
  if (ids.length === 0) return;
  await enqueueWrite(async () => {
    const instance = await getGraph();
    const listingNodes = await instance.queryPersisted().whereNodeType(LISTING_NODE_TYPE).toArray();
    const removedIds = new Set(
      listingNodes
        .filter((node) => ids.includes((node.data as Partial<ListingNodeData>).eventId ?? ''))
        .map((node) => node.id)
    );
    for (const id of removedIds) await instance.getNodeSafe(id);
    await instance.transaction((tx) => {
      for (const id of removedIds) tx.removeNode(id);
      for (const eventId of ids) {
        tx.addNode({
          id: `deleted-event:${eventId}`,
          type: TOMBSTONE_NODE_TYPE,
          data: { eventId },
          insertedAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    });
    await instance.flush();
  });
}

export async function getBrowseItemFromStore(pubkey: string, listingId: string): Promise<BrowseItem | null> {
  const instance = await getGraph();
  const node = await instance.getNodeSafe(`listing:${pubkey}:${listingId}`);
  if (!node || node.type !== LISTING_NODE_TYPE) return null;
  const item = itemFromNode(node);
  if (!item) return null;
  return (await instance.getNodeSafe(`deleted-event:${item.eventId}`)) ? null : item;
}

function relationTargetIds(filters: BrowseQueryFilters, categoryScope?: string): Map<string, Set<string>> {
  const targets = new Map<string, Set<string>>();
  const categories = new Set([...(categoryScope ? [categoryScope] : []), ...(filters.categories ?? [])]);
  if (categories.size > 0) targets.set(BROWSE_EDGE.CATEGORY, new Set(Array.from(categories, categoryNodeId)));
  if (filters.subcategories?.length) {
    targets.set(BROWSE_EDGE.SUBCATEGORY, new Set(filters.subcategories.map((entry) => {
      const separator = entry.indexOf('::');
      return separator < 0 ? entry : subcategoryNodeId(entry.slice(0, separator), entry.slice(separator + 2));
    })));
  }
  if (filters.geohashPrefix) {
    targets.set(BROWSE_EDGE.GEOHASH, new Set(getGeohashPrefixes(filters.geohashPrefix).map(geohashNodeId)));
  }
  return targets;
}

export async function queryBrowseCacheKeys(filters: BrowseQueryFilters, categoryScope?: string): Promise<string[]> {
  const instance = await getGraph();
  const targets = relationTargetIds(filters, categoryScope);
  let query = instance.queryPersisted().whereNodeType(LISTING_NODE_TYPE);
  for (const [edgeType, targetIds] of targets) {
    query = query.join(edgeType, 'out', (node) => targetIds.has(node.id));
  }
  const nodes = await query.toArray();
  return nodes.map((node) => {
    const item = itemFromNode(node);
    return item ? `${item.pubkey}:${item.listing.id}` : '';
  }).filter(Boolean);
}

/** Graph-backed seller lookup for profile and reputation features. */
export async function queryBrowseItemsBySeller(pubkey: string): Promise<BrowseItem[]> {
  const instance = await getGraph();
  const sellerId = `seller:${pubkey}`;
  const nodes = await instance
    .queryPersisted()
    .whereNodeType(LISTING_NODE_TYPE)
    .join(BROWSE_EDGE.AUTHOR, 'out', (node) => node.id === sellerId)
    .orderBy('created_at', 'desc')
    .toArray();
  return nodes.map(itemFromNode).filter((item): item is BrowseItem => item !== null);
}

export function resetBrowseCacheStoreForTests(): void {
  graph = null;
  graphPromise = null;
  writeTail = Promise.resolve();
}
