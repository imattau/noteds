import { SimplePool, type Event, type Filter } from 'nostr-tools';
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { parseListingEvent } from '../src/lib/nostr/listings.ts';
import {
  queryHybridBrowseItems,
  resetBrowseCacheStoreForTests,
  setBrowseEmbeddingProvider,
  upsertBrowseItems
} from '../src/lib/nostr/browseCacheStore.ts';
import { evaluateRanking } from '../src/lib/nostr/rankingEvaluation.ts';
import type { BrowseItem } from '../src/lib/nostr/browseCounts.ts';

const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
const DEFAULT_LIMIT = 250;
const DEFAULT_RUNS = 5;
const BROWSER_MODEL = 'onnx-community/all-MiniLM-L6-v2-ONNX';

interface Options {
  relays: string[];
  limit: number;
  runs: number;
  sinceDays: number;
  json: boolean;
  embedding: 'feature-hash' | 'browser';
}

interface BenchmarkResult {
  name: string;
  filters: Record<string, unknown>;
  resultCount: number;
  meanMs: number;
  p95Ms: number;
  topResults: string[];
  proxyMetrics: ReturnType<typeof evaluateRanking> | null;
}

interface ReliabilityReport {
  repeatability: { stableQueries: number; totalQueries: number; rate: number };
  keywordProxy: { queryCount: number; meanRecallAt20: number; meanPrecisionAt20: number; meanMrr: number; queries: string[] };
  filterCorrectness: { categoryPassed: boolean; geohashPassed: boolean; activeStatusPassed: boolean };
}

function numberOption(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function parseOptions(argv: string[]): Options {
  const valueAfter = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    relays: (valueAfter('--relays') ?? DEFAULT_RELAYS.join(','))
      .split(',')
      .map((relay) => relay.trim())
      .filter(Boolean),
    limit: numberOption(valueAfter('--limit'), DEFAULT_LIMIT),
    runs: numberOption(valueAfter('--runs'), DEFAULT_RUNS),
    sinceDays: numberOption(valueAfter('--since-days'), 30),
    json: argv.includes('--json'),
    embedding: valueAfter('--embedding') === 'browser' ? 'browser' : 'feature-hash'
  };
}

async function loadEmbeddingProvider(embedding: Options['embedding']) {
  if (embedding === 'feature-hash') return;
  console.log(`Loading browser embedding model in Node CPU: ${BROWSER_MODEL}...`);
  const extractor = await pipeline('feature-extraction', BROWSER_MODEL, { device: 'cpu', dtype: 'q4' });
  setBrowseEmbeddingProvider({
    version: `transformers:${BROWSER_MODEL}:node-cpu-q4`,
    dimensions: 384,
    embed: async (text) => {
      const output = await (extractor as FeatureExtractionPipeline)(text, { pooling: 'mean', normalize: true });
      return new Float64Array(output.data as ArrayLike<number>);
    }
  });
}

function listingKey(item: BrowseItem): string {
  return `${item.pubkey}:${item.listing.id}`;
}

function canonicalListingEvents(events: Event[]): Event[] {
  const canonical = new Map<string, Event>();
  for (const event of events) {
    const identifier = event.tags.find(([tag]) => tag === 'd')?.[1];
    if (!identifier) continue;
    const key = `${event.pubkey}:${identifier}`;
    const current = canonical.get(key);
    if (!current || event.created_at > current.created_at) canonical.set(key, event);
  }
  return Array.from(canonical.values());
}

function toBrowseItems(events: Event[]): BrowseItem[] {
  return canonicalListingEvents(events).flatMap((event) => {
    try {
      const listing = parseListingEvent(event);
      if (!listing.id || !listing.title) return [];
      return [{ listing, created_at: event.created_at, eventId: event.id, pubkey: event.pubkey }];
    } catch {
      return [];
    }
  });
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function proxyRelevantIds(items: BrowseItem[], keyword: string): string[] {
  const terms = Array.from(new Set(tokenize(keyword)));
  return items
    .filter((item) => {
      const text = `${item.listing.title} ${item.listing.summary} ${item.listing.content}`.toLowerCase();
      return terms.length > 0 && terms.every((term) => text.includes(term));
    })
    .map(listingKey);
}

function candidateKeywords(items: BrowseItem[]): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'kit', 'api']);
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const token of new Set(tokenize(item.listing.title))) {
      if (token.length >= 4 && !stopWords.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([token]) => token);
}

async function assessReliability(items: BrowseItem[]): Promise<ReliabilityReport> {
  const keywords = candidateKeywords(items);
  let stableQueries = 0;
  const metrics = [] as Array<ReturnType<typeof evaluateRanking>>;
  const recalls: number[] = [];
  for (const keyword of keywords) {
    const first = await queryHybridBrowseItems({ keyword }, undefined, 20);
    const second = await queryHybridBrowseItems({ keyword }, undefined, 20);
    if (first.map(listingKey).join('|') === second.map(listingKey).join('|')) stableQueries += 1;
    const relevant = proxyRelevantIds(items, keyword);
    if (relevant.length > 0) {
      metrics.push(evaluateRanking(first.map(listingKey), relevant, 20));
      const relevantSet = new Set(relevant);
      recalls.push(first.slice(0, 20).filter((item) => relevantSet.has(listingKey(item))).length / relevantSet.size);
    }
  }

  const category = items.flatMap((item) => item.listing.categories)[0];
  const categoryResults = category ? await queryHybridBrowseItems({ categories: [category] }, undefined, 50) : [];
  const geohash = items.find((item) => item.listing.geohash)?.listing.geohash?.slice(0, 5);
  const geohashResults = geohash ? await queryHybridBrowseItems({ geohashPrefix: geohash }, undefined, 50) : [];
  const geohashMatches = (item: BrowseItem) => Boolean(item.listing.geohash && (item.listing.geohash.startsWith(geohash ?? '') || (geohash ?? '').startsWith(item.listing.geohash)));
  return {
    repeatability: {
      stableQueries,
      totalQueries: keywords.length,
      rate: keywords.length > 0 ? stableQueries / keywords.length : 1
    },
    keywordProxy: {
      queryCount: metrics.length,
      meanRecallAt20: recalls.length > 0 ? recalls.reduce((total, recall) => total + recall, 0) / recalls.length : 0,
      meanPrecisionAt20: metrics.length > 0 ? metrics.reduce((total, metric) => total + metric.precisionAtK, 0) / metrics.length : 0,
      meanMrr: metrics.length > 0 ? metrics.reduce((total, metric) => total + metric.reciprocalRank, 0) / metrics.length : 0,
      queries: keywords
    },
    filterCorrectness: {
      categoryPassed: categoryResults.every((item) => item.listing.categories.includes(category ?? '')),
      geohashPassed: geohashResults.every(geohashMatches),
      activeStatusPassed: [...categoryResults, ...geohashResults].every((item) => item.listing.status === 'active')
    }
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

async function benchmarkQuery(
  name: string,
  filters: Parameters<typeof queryHybridBrowseItems>[0],
  allItems: BrowseItem[],
  runs: number
): Promise<BenchmarkResult> {
  const timings: number[] = [];
  let results: Awaited<ReturnType<typeof queryHybridBrowseItems>> = [];
  for (let run = 0; run < Math.max(1, runs); run += 1) {
    const start = performance.now();
    results = await queryHybridBrowseItems(filters, undefined, 20);
    timings.push(performance.now() - start);
  }
  const keyword = filters.keyword ?? '';
  const relevantIds = keyword ? proxyRelevantIds(allItems, keyword) : null;
  return {
    name,
    filters,
    resultCount: results.length,
    meanMs: timings.reduce((total, value) => total + value, 0) / timings.length,
    p95Ms: percentile(timings, 0.95),
    topResults: results.slice(0, 5).map((result) => result.listing.title),
    proxyMetrics: relevantIds && relevantIds.length > 0
      ? evaluateRanking(results.map(listingKey), relevantIds, 10)
      : null
  };
}

function printResult(result: BenchmarkResult) {
  console.log(`\n${result.name}`);
  console.log(`  results: ${result.resultCount} | mean: ${result.meanMs.toFixed(2)}ms | p95: ${result.p95Ms.toFixed(2)}ms`);
  console.log(`  top: ${result.topResults.join(' · ') || '(none)'}`);
  if (result.proxyMetrics) {
    console.log(`  proxy MRR: ${result.proxyMetrics.reciprocalRank.toFixed(3)} | precision@10: ${result.proxyMetrics.precisionAtK.toFixed(3)} | nDCG@10: ${result.proxyMetrics.ndcgAtK.toFixed(3)}`);
  }
}

function printReliability(report: ReliabilityReport) {
  console.log('\nReliability');
  console.log(`  repeatability: ${(report.repeatability.rate * 100).toFixed(1)}% (${report.repeatability.stableQueries}/${report.repeatability.totalQueries})`);
  console.log(`  keyword proxy: ${report.keywordProxy.queryCount} queries | mean recall@20: ${report.keywordProxy.meanRecallAt20.toFixed(3)} | precision@20: ${report.keywordProxy.meanPrecisionAt20.toFixed(3)} | MRR: ${report.keywordProxy.meanMrr.toFixed(3)}`);
  console.log(`  filters: category=${report.filterCorrectness.categoryPassed ? 'pass' : 'FAIL'} geohash=${report.filterCorrectness.geohashPassed ? 'pass' : 'FAIL'} active=${report.filterCorrectness.activeStatusPassed ? 'pass' : 'FAIL'}`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.relays.length === 0) throw new Error('At least one relay is required.');
  const since = Math.floor(Date.now() / 1000) - options.sinceDays * 24 * 60 * 60;
  const filter: Filter = { kinds: [30402], since, limit: options.limit };
  const pool = new SimplePool({ enableReconnect: false });
  const startedAt = performance.now();
  console.log(`Fetching up to ${options.limit} listings from ${options.relays.length} relays...`);
  const events = await pool.querySync(options.relays, filter, { maxWait: 15_000 });
  pool.close(options.relays);
  const items = toBrowseItems(events);
  if (items.length === 0) throw new Error('No valid NIP-99 kind 30402 listings were returned.');

  resetBrowseCacheStoreForTests();
  await loadEmbeddingProvider(options.embedding);
  await upsertBrowseItems(items);
  const commonCategory = items.flatMap((item) => item.listing.categories)[0];
  const commonGeohash = items.find((item) => item.listing.geohash)?.listing.geohash?.slice(0, 5);
  const queries = [
    ['keyword: bike', { keyword: 'bike' }],
    ['category intersection', commonCategory ? { categories: [commonCategory] } : { keyword: ' ' }],
    ['geohash expansion', commonGeohash ? { geohashPrefix: commonGeohash } : { keyword: ' ' }]
  ] as const;
  const results = [];
  for (const [name, filters] of queries) {
    results.push(await benchmarkQuery(name, filters, items, options.runs));
  }
  const reliability = await assessReliability(items);

  const report = {
    fetchedEvents: events.length,
    canonicalListings: items.length,
    fetchAndIndexMs: performance.now() - startedAt,
    relays: options.relays,
    since,
    embedding: options.embedding === 'browser'
      ? `Transformers.js ${BROWSER_MODEL} via Node CPU q4`
      : 'FeatureHashEmbedding baseline (CLI)',
    results,
    reliability
  };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Indexed ${items.length} canonical listings from ${events.length} events in ${report.fetchAndIndexMs.toFixed(2)}ms.`);
    results.forEach(printResult);
    printReliability(reliability);
    console.log('\nProxy metrics use exact keyword containment as relevance labels; treat them as regression signals, not human judgments.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
