import {
  buildEmbeddingText,
  cosineSimilarity,
  edgeId,
  FeatureHashEmbedding,
  MemoryAdapter,
  PolyGraph
} from '@0xx0lostcause0xx0/polypack';
import { BinaryStoreAdapter } from '@0xx0lostcause0xx0/polypack/persistence/opfs';
import type { GraphTransaction, PolyEdge, PolyNode } from '@0xx0lostcause0xx0/polypack';
import type { BrowseItem } from './browseCounts';
import type { BrowseQueryFilters } from './browseCache';
import type { SellerReview } from './reviews';
import { decodeGeohash, distanceKm } from './geohash';

/** Shared graph nodes are reference-owned: removing a listing never removes them. */
export const BROWSE_EDGE = {
  CATEGORY: 'IN_CATEGORY',
  SUBCATEGORY: 'IN_SUBCATEGORY',
  GEOHASH: 'LOCATED_IN',
  AUTHOR: 'AUTHORED_BY'
} as const;

const LISTING_NODE_TYPE = 'listing';
const REVIEW_NODE_TYPE = 'seller-review';
const TOMBSTONE_NODE_TYPE = 'deleted-event';
const GRAPH_STORE_NAME = 'noteds-browse-graph';
const SHARED_NODE_TYPES = new Set(['category', 'subcategory', 'geohash', 'seller', 'reviewer']);
const RELATION_EDGE_TYPES = ['IN_CATEGORY', 'IN_SUBCATEGORY', 'LOCATED_IN', 'AUTHORED_BY', 'REVIEWS_SELLER', 'WRITTEN_BY'];
const DEFAULT_EMBEDDING_VERSION = 'feature-hash-384-v1';

export interface BrowseEmbeddingProvider {
  readonly version: string;
  readonly dimensions: number;
  embed(text: string): Float64Array;
}

const defaultListingEmbedding = new FeatureHashEmbedding({ dimensions: 384 });
let listingEmbedding: BrowseEmbeddingProvider = {
  version: DEFAULT_EMBEDDING_VERSION,
  dimensions: 384,
  embed: (text) => defaultListingEmbedding.embed(text)
};

const reputationCache = new Map<string, { expiresAt: number; reputation: SellerReputation }>();
const REPUTATION_CACHE_TTL_MS = 5 * 60 * 1000;

interface ListingNodeData {
  item: BrowseItem;
  eventId: string;
  pubkey: string;
  created_at: number;
  embeddingVersion: string;
  embeddingTextHash: string;
}

interface TombstoneNodeData {
  eventId: string;
}

interface ReviewNodeData {
  review: SellerReview;
  sellerPubkey: string;
}

export interface SellerReputation {
  count: number;
  averageRating: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface RelatedBrowseItem extends BrowseItem {
  relevance: number;
}

export interface HybridBrowseItem extends BrowseItem {
  relevance: number;
  keywordScore: number;
  semanticScore: number;
  graphScore: number;
  freshnessScore: number;
  qualityScore: number;
  reputationScore: number;
  distanceKm: number | null;
  distanceScore: number;
}

export function setBrowseEmbeddingProvider(provider: BrowseEmbeddingProvider): void {
  listingEmbedding = provider;
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

function reviewNodeId(review: SellerReview): string {
  return `review:${review.reviewerPubkey}:${review.id}`;
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

function embeddingTextForItem(item: BrowseItem): string {
  return buildEmbeddingText(
    {
      title: item.listing.title,
      summary: item.listing.summary,
      categories: item.listing.categories.join(' '),
      subcategories: (item.listing.subcategories ?? [])
        .map((entry) => `${entry.parent} ${entry.value}`)
        .join(' '),
      location: item.listing.location ?? '',
      content: item.listing.content
    },
    { title: 3, summary: 2, categories: 2, subcategories: 2, location: 1, content: 1 }
  );
}

/** Small deterministic hash for detecting stale local embedding input. */
function embeddingTextHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function listingEmbeddingMetadata(item: BrowseItem) {
  const text = embeddingTextForItem(item);
  return {
    embeddingVersion: listingEmbedding.version,
    embeddingTextHash: embeddingTextHash(text),
    vector: listingEmbedding.embed(text)
  };
}

function makeSharedNode(id: string, type: string, label: string): PolyNode {
  const now = Date.now();
  return { id, type, data: { label }, insertedAt: now, updatedAt: now };
}

async function backfillListingEmbeddings(instance: PolyGraph): Promise<void> {
  const nodes = await instance.queryPersisted().whereNodeType(LISTING_NODE_TYPE).toArray();
  let changed = false;
  for (const node of nodes) {
    const item = itemFromNode(node);
    const data = node.data as Partial<ListingNodeData>;
    if (!item) continue;
    const textHash = embeddingTextHash(embeddingTextForItem(item));
    if (node.vector?.length === listingEmbedding.dimensions && data.embeddingVersion === listingEmbedding.version && data.embeddingTextHash === textHash) {
      continue;
    }
    await instance.getNodeSafe(node.id);
    const embedding = listingEmbeddingMetadata(item);
    instance.updateNode(node.id, {
      ...data,
      embeddingVersion: embedding.embeddingVersion,
      embeddingTextHash: embedding.embeddingTextHash
    }, embedding.vector);
    changed = true;
  }
  if (changed) await instance.flush();
}

async function getGraph(): Promise<PolyGraph> {
  if (graph) return graph;
  if (!graphPromise) {
    graphPromise = (async () => {
      let instance: PolyGraph;
      if (hasOPFS()) {
        try {
          const adapter = new BinaryStoreAdapter({ storeDir: GRAPH_STORE_NAME });
          instance = new PolyGraph(adapter, 5000);
          await instance.warm();
        } catch (error) {
          console.warn('Polypack OPFS unavailable; using an in-memory browse graph.', error);
          instance = new PolyGraph(new MemoryAdapter(), 5000);
          await instance.warm();
        }
      } else {
        instance = new PolyGraph(new MemoryAdapter(), 5000);
        await instance.warm();
      }
      instance.defineIndex({ name: 'listing-event-id', nodeType: LISTING_NODE_TYPE, fields: ['eventId'] });
      instance.defineIndex({ name: 'listing-pubkey', nodeType: LISTING_NODE_TYPE, fields: ['pubkey'] });
      instance.defineIndex({ name: 'listing-created-at', nodeType: LISTING_NODE_TYPE, fields: ['created_at'] });
      await backfillListingEmbeddings(instance);
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

function reviewFromNode(node: PolyNode): SellerReview | null {
  const data = node.data as Partial<ReviewNodeData>;
  return data.review && typeof data.review === 'object' ? data.review : null;
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
        const embedding = listingEmbeddingMetadata(item);
        tx.addNode({
          id,
          type: LISTING_NODE_TYPE,
          data: {
            item,
            eventId: item.eventId,
            pubkey: item.pubkey,
            created_at: item.created_at,
            embeddingVersion: embedding.embeddingVersion,
            embeddingTextHash: embedding.embeddingTextHash
          },
          vector: embedding.vector,
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

function normalizedTokens(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function keywordScore(item: BrowseItem, keyword: string): number {
  const tokens = Array.from(new Set(normalizedTokens(keyword)));
  if (tokens.length === 0) return 0;
  const searchableText = [
    item.listing.title,
    item.listing.summary,
    item.listing.content,
    item.listing.location ?? '',
    ...item.listing.categories,
    ...(item.listing.subcategories ?? []).flatMap((entry) => [entry.parent, entry.value])
  ].join(' ').toLowerCase();
  return tokens.filter((token) => searchableText.includes(token)).length / tokens.length;
}

function listingQualityScore(item: BrowseItem): number {
  let score = item.listing.status === 'active' ? 0.35 : 0;
  if (item.listing.title.trim()) score += 0.15;
  if (item.listing.summary.trim()) score += 0.15;
  if (item.listing.content.trim()) score += 0.15;
  if (item.listing.images.length > 0) score += 0.1;
  if (item.listing.categories.length > 0) score += 0.1;
  return Math.min(1, score);
}

function freshnessScore(createdAt: number): number {
  const ageDays = Math.max(0, (Date.now() / 1000 - createdAt) / 86_400);
  return Math.exp(-ageDays / 90);
}

function graphOverlapScore(item: BrowseItem, filters: BrowseQueryFilters, categoryScope?: string): number {
  const categories = new Set([...(categoryScope ? [categoryScope] : []), ...(filters.categories ?? [])]);
  const categoryScore = categories.size === 0
    ? 0
    : item.listing.categories.filter((category) => categories.has(category)).length / categories.size;
  const subcategories = filters.subcategories ?? [];
  const subcategoryScore = subcategories.length === 0
    ? 0
    : subcategories.filter((value) => item.listing.subcategories?.some((entry) => `${entry.parent}::${entry.value}` === value)).length / subcategories.length;
  const geohashScore = filters.geohashPrefix
    ? Math.min(1, (item.listing.geohash ?? '').length > 0
      ? Array.from({ length: Math.min(filters.geohashPrefix.length, item.listing.geohash?.length ?? 0) }, (_, index) => index)
        .filter((index) => item.listing.geohash?.[index] === filters.geohashPrefix?.[index]).length / filters.geohashPrefix.length
      : 0)
    : 0;
  const scores = [
    ...(categories.size > 0 ? [categoryScore] : []),
    ...(subcategories.length > 0 ? [subcategoryScore] : []),
    ...(filters.geohashPrefix ? [geohashScore] : [])
  ];
  return scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
}

function distanceScoreFor(item: BrowseItem, geohashPrefix?: string): { distanceKm: number | null; score: number } {
  if (!geohashPrefix || !item.listing.geohash) return { distanceKm: null, score: 0 };
  const source = decodeGeohash(geohashPrefix);
  const candidate = decodeGeohash(item.listing.geohash);
  if (!source || !candidate) return { distanceKm: null, score: 0 };
  const kilometres = distanceKm(source, candidate);
  return { distanceKm: kilometres, score: Math.exp(-kilometres / 50) };
}

async function getCachedSellerReputation(sellerPubkey: string): Promise<SellerReputation> {
  const cached = reputationCache.get(sellerPubkey);
  if (cached && cached.expiresAt > Date.now()) return cached.reputation;
  const reputation = await getSellerReputation(sellerPubkey);
  reputationCache.set(sellerPubkey, { reputation, expiresAt: Date.now() + REPUTATION_CACHE_TTL_MS });
  return reputation;
}

/** Retrieve and rank listings using graph filters, lexical matching, and stored vectors. */
export async function queryHybridBrowseItems(
  filters: BrowseQueryFilters,
  categoryScope?: string,
  limit = 30
): Promise<HybridBrowseItem[]> {
  const instance = await getGraph();
  const targets = relationTargetIds(filters, categoryScope);
  let query = instance.queryPersisted().whereNodeType(LISTING_NODE_TYPE);
  for (const [edgeType, targetIds] of targets) {
    query = query.join(edgeType, 'out', (node) => targetIds.has(node.id));
  }
  const nodes = await query.toArray();
  const keyword = filters.keyword?.trim() ?? '';
  const queryVector = keyword.length > 0
    ? listingEmbedding.embed(buildEmbeddingText({ query: keyword }))
    : null;
  const hasGraphConstraint = targets.size > 0;
  const ranked: HybridBrowseItem[] = [];

  for (const node of nodes) {
    const item = itemFromNode(node);
    if (!item || item.listing.status !== 'active') continue;
    if (filters.since !== undefined && item.created_at < filters.since) continue;
    if (filters.location && !(item.listing.location ?? '').toLowerCase().includes(filters.location.toLowerCase())) continue;

    const keywordMatch = keywordScore(item, keyword);
    const semanticMatch = queryVector && node.vector
      ? Math.max(0, cosineSimilarity(queryVector, node.vector))
      : 0;
    const graphMatch = hasGraphConstraint ? graphOverlapScore(item, filters, categoryScope) : 0;
    const distance = distanceScoreFor(item, filters.geohashPrefix);
    const fresh = freshnessScore(item.created_at);
    const quality = listingQualityScore(item);
    const reputation = await getCachedSellerReputation(item.pubkey);
    const reputationMatch = reputation.count > 0 ? reputation.averageRating / 5 : 0.5;

    const weights = [
      keyword ? [keywordMatch, 0.3] : [0, 0],
      keyword ? [semanticMatch, 0.25] : [0, 0],
      hasGraphConstraint ? [graphMatch, 0.15] : [0, 0],
      filters.geohashPrefix ? [distance.score, 0.1] : [0, 0],
      [fresh, 0.1],
      [quality, 0.1],
      [reputationMatch, 0.05]
    ] as Array<[number, number]>;
    const totalWeight = weights.reduce((total, [, weight]) => total + weight, 0) || 1;
    const relevance = weights.reduce((total, [score, weight]) => total + score * weight, 0) / totalWeight;
    ranked.push({
      ...item,
      relevance,
      keywordScore: keywordMatch,
      semanticScore: semanticMatch,
      graphScore: graphMatch,
      freshnessScore: fresh,
      qualityScore: quality,
      reputationScore: reputationMatch,
      distanceKm: distance.distanceKm,
      distanceScore: distance.score
    });
  }

  return ranked
    .sort((a, b) => b.relevance - a.relevance || b.created_at - a.created_at)
    .slice(0, Math.max(0, limit));
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

export async function cacheBrowseReviews(reviews: SellerReview[]): Promise<void> {
  if (reviews.length === 0) return;
  for (const sellerPubkey of new Set(reviews.map((review) => review.sellerPubkey))) reputationCache.delete(sellerPubkey);
  await enqueueWrite(async () => {
    const instance = await getGraph();
    await instance.transaction((tx) => {
      for (const review of reviews) {
        const sellerId = `seller:${review.sellerPubkey}`;
        const reviewerId = `reviewer:${review.reviewerPubkey}`;
        const id = reviewNodeId(review);
        tx.addNode({
          id,
          type: REVIEW_NODE_TYPE,
          data: { review, sellerPubkey: review.sellerPubkey, created_at: review.created_at },
          insertedAt: review.created_at * 1000,
          updatedAt: Date.now()
        });
        tx.addNode(makeSharedNode(sellerId, 'seller', review.sellerPubkey));
        tx.addNode(makeSharedNode(reviewerId, 'reviewer', review.reviewerPubkey));
        tx.addEdge({
          id: edgeId(id, 'REVIEWS_SELLER', sellerId),
          source: id,
          type: 'REVIEWS_SELLER',
          target: sellerId,
          createdAt: Date.now(),
          data: { ownership: 'reference' }
        });
        tx.addEdge({
          id: edgeId(id, 'WRITTEN_BY', reviewerId),
          source: id,
          type: 'WRITTEN_BY',
          target: reviewerId,
          createdAt: Date.now(),
          data: { ownership: 'reference' }
        });
      }
    });
    await instance.flush();
  });
}

export async function queryBrowseReviewsBySeller(sellerPubkey: string): Promise<SellerReview[]> {
  const instance = await getGraph();
  const sellerId = `seller:${sellerPubkey}`;
  const nodes = await instance
    .queryPersisted()
    .whereNodeType(REVIEW_NODE_TYPE)
    .join('REVIEWS_SELLER', 'out', (node) => node.id === sellerId)
    .orderBy('created_at', 'desc')
    .toArray();
  return nodes.map(reviewFromNode).filter((review): review is SellerReview => review !== null);
}

export async function getSellerReputation(sellerPubkey: string): Promise<SellerReputation> {
  const reviews = await queryBrowseReviewsBySeller(sellerPubkey);
  const distribution: SellerReputation['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) distribution[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
  return {
    count: reviews.length,
    averageRating: reviews.length === 0
      ? 0
      : reviews.reduce((total, review) => total + review.rating, 0) / reviews.length,
    distribution
  };
}

/** Keep durable graph storage bounded and remove shared nodes no longer in use. */
export async function pruneBrowseCacheStore(maxItems = 200, maxDeletions = 500): Promise<void> {
  await enqueueWrite(async () => {
    const instance = await getGraph();
    const listingNodes = await instance.queryPersisted().whereNodeType(LISTING_NODE_TYPE).toArray();
    const tombstoneNodes = await instance.queryPersisted().whereNodeType(TOMBSTONE_NODE_TYPE).toArray();
    const keepListings = new Set(
      listingNodes
        .sort((a, b) => ((b.data as Partial<ListingNodeData>).created_at ?? 0) - ((a.data as Partial<ListingNodeData>).created_at ?? 0))
        .slice(0, Math.max(0, maxItems))
        .map((node) => node.id)
    );
    const keepTombstones = new Set(
      tombstoneNodes
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(0, maxDeletions))
        .map((node) => node.id)
    );
    const removeIds = [
      ...listingNodes.filter((node) => !keepListings.has(node.id)).map((node) => node.id),
      ...tombstoneNodes.filter((node) => !keepTombstones.has(node.id)).map((node) => node.id)
    ];
    if (removeIds.length > 0) {
      for (const id of removeIds) await instance.getNodeSafe(id);
      await instance.transaction((tx) => {
        for (const id of removeIds) tx.removeNode(id);
      });
      await instance.flush();
    }

    const sharedNodes = (await Promise.all(
      Array.from(SHARED_NODE_TYPES, (type) => instance.queryPersisted().whereNodeType(type).toArray())
    )).flat();
    const orphanIds = sharedNodes
      .filter((node) => RELATION_EDGE_TYPES.every((type) => instance.getEdgeSources(node.id, type).length === 0))
      .map((node) => node.id);
    if (orphanIds.length > 0) {
      for (const id of orphanIds) await instance.getNodeSafe(id);
      await instance.transaction((tx) => {
        for (const id of orphanIds) tx.removeNode(id);
      });
      await instance.flush();
    }
  });
}

/** Rank active listings using the graph's shared taxonomy and location model. */
export async function queryRelatedBrowseItems(
  pubkey: string,
  listingId: string,
  limit = 6
): Promise<RelatedBrowseItem[]> {
  const source = await getBrowseItemFromStore(pubkey, listingId);
  if (!source) return [];

  const instance = await getGraph();
  const nodes = await instance.queryPersisted().whereNodeType(LISTING_NODE_TYPE).toArray();
  const sourceCategories = new Set(source.listing.categories);
  const sourceSubcategories = new Set(
    (source.listing.subcategories ?? []).map((entry) => `${entry.parent}::${entry.value}`)
  );
  const sourceGeohash = source.listing.geohash ?? '';
  const ranked: RelatedBrowseItem[] = [];

  for (const node of nodes) {
    const item = itemFromNode(node);
    if (!item || item.pubkey === pubkey && item.listing.id === listingId || item.listing.status !== 'active') continue;
    const sharedCategories = item.listing.categories.filter((category) => sourceCategories.has(category)).length;
    const sharedSubcategories = (item.listing.subcategories ?? []).filter((entry) =>
      sourceSubcategories.has(`${entry.parent}::${entry.value}`)
    ).length;
    const candidateGeohash = item.listing.geohash ?? '';
    let sharedGeohashPrefix = 0;
    while (
      sharedGeohashPrefix < sourceGeohash.length &&
      sharedGeohashPrefix < candidateGeohash.length &&
      sourceGeohash[sharedGeohashPrefix] === candidateGeohash[sharedGeohashPrefix]
    ) {
      sharedGeohashPrefix += 1;
    }
    const relevance = sharedCategories * 4 + sharedSubcategories * 6 + Math.min(sharedGeohashPrefix, 6);
    if (relevance === 0) continue;
    ranked.push({ ...item, relevance });
  }

  return ranked
    .sort((a, b) => b.relevance - a.relevance || b.created_at - a.created_at)
    .slice(0, Math.max(0, limit));
}

export function resetBrowseCacheStoreForTests(): void {
  graph = null;
  graphPromise = null;
  writeTail = Promise.resolve();
}
