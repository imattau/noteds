# Polypack hybrid search

The browse graph uses Polypack for both retrieval and ranking. Listing nodes contain:

- category, subcategory, geohash, and seller edges for structured graph retrieval;
- a versioned embedding vector for semantic similarity;
- embedding metadata so stale vectors can be rebuilt safely.

`FeatureHashEmbedding` is the offline default. It is intentionally a baseline: it provides deterministic lexical similarity without downloading a model. A production semantic provider can be installed before the graph is first used:

```ts
import { setBrowseEmbeddingProvider } from '$lib/nostr/browseCacheStore';

setBrowseEmbeddingProvider({
  version: 'my-provider-v1',
  dimensions: 768,
  embed: (text) => embedWithYourModel(text)
});
```

The provider may return a `Float64Array` or a promise of one. The built-in browser adapter runs Transformers.js in a Web Worker, warms after the first render, and rebuilds existing vectors when it becomes ready. Changing the provider version causes existing listing vectors to be rebuilt.

`queryBrowseCache` combines keyword overlap, vector similarity, graph overlap, geohash distance, freshness, listing quality, and seller reputation. The result remains a `BrowseItem[]` for existing UI consumers; the lower-level `queryHybridBrowseItems` API exposes each component score for evaluation and future ranking diagnostics.

## Real-relay benchmark

Run the CLI benchmark against public Nostr relays with:

```sh
npm run benchmark:nostr -- --limit 250 --runs 5 --since-days 30
```

Useful options are `--relays wss://relay.example,wss://another.example` and `--json`. The benchmark fetches NIP-99 kind `30402` events, canonicalizes replaceable listings, indexes them in an in-memory Polypack graph, and measures keyword, category, and geohash queries. Keyword metrics use exact text containment as proxy relevance labels; they are regression signals until human-judged relevance data is available.

To exercise the same Transformers.js model outside the browser, use the Node CPU path:

```sh
npm run benchmark:nostr -- --embedding browser --limit 80 --runs 3
```

This validates model loading, vector generation, graph persistence, and ranking. It uses Node CPU rather than browser WebGPU because this is a CLI run.
