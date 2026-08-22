# Noteds

Noteds is a browser-first, peer-to-peer classifieds marketplace built on Nostr. It lets people discover, publish, and message about local listings without relying on a central marketplace backend.

## What it does

- Reads classified listings from configurable Nostr relays.
- Publishes listings, edits, deletions, reviews, and direct messages through Nostr.
- Supports browser-based authentication through NIP-07 and passkeys.
- Stores a local browse graph with [Polypack](https://github.com/0xx0lostcause0xx0/polypack).
- Models listings, categories, subcategories, and geohash areas as graph nodes connected by typed edges.
- Uses hybrid local retrieval: keyword matching, graph relationships, geohash expansion, listing vectors, and browser semantic embeddings when available.
- Keeps search usable offline or on constrained devices with deterministic FeatureHashEmbedding vectors and in-memory fallbacks.
- Collects human relevance labels and includes CLI ranking benchmarks for search regression testing.

The browser search path is designed to evolve: Polypack provides the local graph and retrieval substrate today, while higher-quality embedding models can be introduced later without changing the stored listing shape.

## Search architecture

The local browse graph is persisted in OPFS when available and falls back to memory when browser storage is unavailable. Listing records can store embedding vectors with version and input-hash metadata so stale vectors can be rebuilt safely.

Search combines several signals:

- exact keyword and field matches;
- category and subcategory graph matches;
- nearby geohash expansion;
- related listings and deduplication;
- vector similarity from the deterministic local baseline or the browser model;
- freshness, listing quality, distance, and seller reputation where available.

The browser embedding provider tries WebGPU first, then WASM, and finally retains the local deterministic baseline when a model cannot load. This keeps the app functional across browsers and hardware capabilities.

## Development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test -- --run   # unit and ranking tests
npm run check       # Svelte and TypeScript diagnostics
npm run build       # production static build
npm run preview     # preview the production build
```

The app is a SvelteKit static site. It can be served from any static host; relay access, browser storage, Web Workers, WebGPU/WASM support, and Nostr signer availability are runtime capabilities of the browser.

## Nostr and local data

Noteds does not require a central account database. Listings and social activity are Nostr events. The local Polypack graph is a derived browser cache and can be rebuilt from relay data. Configure relay access in the application settings before publishing or browsing a specific relay set.

## Project status

Noteds is under active development. Search, graph persistence, browser embeddings, passkey support, and classified-event interoperability are implemented, while ranking weights and production-scale relay/index strategies will continue to evolve.

## License

No license has been published yet.
