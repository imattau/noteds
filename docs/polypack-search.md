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

The provider must return a synchronous `Float64Array`. If a model is asynchronous, load or batch it at the application boundary and expose a ready adapter to the graph. Changing the provider version causes existing listing vectors to be rebuilt on graph warm-up.

`queryBrowseCache` combines keyword overlap, vector similarity, graph overlap, geohash distance, freshness, listing quality, and seller reputation. The result remains a `BrowseItem[]` for existing UI consumers; the lower-level `queryHybridBrowseItems` API exposes each component score for evaluation and future ranking diagnostics.
