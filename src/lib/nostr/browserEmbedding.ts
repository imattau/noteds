import { isTauriApp } from '$lib/platform';
import { reindexBrowseEmbeddings, setBrowseEmbeddingProvider, type BrowseEmbeddingProvider } from './browseCacheStore';

export const DEFAULT_BROWSER_EMBEDDING_MODEL = 'onnx-community/all-MiniLM-L6-v2-ONNX';

interface PendingRequest {
  resolve: (vector: Float64Array) => void;
  reject: (error: Error) => void;
}

export interface BrowserEmbeddingOptions {
  model?: string;
  dimensions?: number;
  device?: 'wasm' | 'webgpu';
}

export interface BrowserEmbeddingProvider extends BrowseEmbeddingProvider {
  /** Stop the worker and release the model it loaded. */
  dispose(): void;
}

/** Create a lazy Web Worker-backed Transformers.js embedding provider. */
export function createBrowserEmbeddingProvider(options: BrowserEmbeddingOptions = {}): BrowserEmbeddingProvider {
  if (typeof Worker === 'undefined') {
    throw new Error('Browser embedding requires Web Worker support.');
  }
  const model = options.model ?? DEFAULT_BROWSER_EMBEDDING_MODEL;
  const device = options.device ?? (typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm');
  const dimensions = options.dimensions ?? 384;
  const worker = new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 0;
  const pending = new Map<number, PendingRequest>();

  worker.onmessage = ({ data }: MessageEvent<{ id: number; vector?: number[]; error?: string }>) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error || !data.vector) {
      request.reject(new Error(data.error ?? 'Browser embedding returned no vector.'));
      return;
    }
    request.resolve(new Float64Array(data.vector));
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || 'Browser embedding worker failed.');
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  return {
    version: `transformers:${model}:${device}`,
    dimensions,
    embed(text) {
      return new Promise<Float64Array>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, text, model, device });
      });
    },
    dispose() {
      worker.terminate();
      const error = new Error('Browser embedding provider disposed.');
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    }
  };
}

const WEBGPU_UNSUPPORTED_KEY = 'noteds:semantic-webgpu-unsupported';
/** Retry WebGPU occasionally: browser and driver updates can add support. */
const WEBGPU_UNSUPPORTED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isWebGpuKnownUnsupported(model: string): boolean {
  try {
    const stored = JSON.parse(localStorage.getItem(WEBGPU_UNSUPPORTED_KEY) ?? 'null') as
      | { model?: unknown; at?: unknown }
      | null;
    return (
      stored?.model === model &&
      typeof stored.at === 'number' &&
      Date.now() - stored.at < WEBGPU_UNSUPPORTED_TTL_MS
    );
  } catch {
    return false;
  }
}

function rememberWebGpuUnsupported(model: string): void {
  try {
    localStorage.setItem(WEBGPU_UNSUPPORTED_KEY, JSON.stringify({ model, at: Date.now() }));
  } catch {
    // Best effort: without storage we just retry WebGPU next session.
  }
}

/** Warm the model off the main UI path, then switch graph ranking to it. */
export async function enableBrowserSemanticSearch(options: BrowserEmbeddingOptions = {}): Promise<boolean> {
  if (typeof Worker === 'undefined') {
    console.warn('Browser semantic search unavailable without Web Worker support.');
    return false;
  }
  const model = options.model ?? DEFAULT_BROWSER_EMBEDDING_MODEL;
  // Android WebView GPU compute competes with the system compositor and makes
  // the whole device sluggish, so the app build stays on WASM in the worker.
  const devices: Array<BrowserEmbeddingOptions['device']> = options.device
    ? [options.device]
    : isTauriApp
      ? ['wasm']
      : typeof navigator !== 'undefined' && 'gpu' in navigator && !isWebGpuKnownUnsupported(model)
      ? ['webgpu', 'wasm']
      : ['wasm'];
  let lastError: unknown;
  let webGpuFailed = false;
  for (const device of devices) {
    const provider = createBrowserEmbeddingProvider({ ...options, device });
    try {
      await provider.embed('semantic search warmup');
    } catch (error) {
      // A failed attempt's worker would otherwise stay alive holding its runtime.
      provider.dispose();
      if (device === 'webgpu') webGpuFailed = true;
      lastError = error;
      console.warn(`Browser semantic search ${device} provider unavailable; trying the next fallback.`, error);
      continue;
    }
    // WASM loading the same model proves the WebGPU failure was the device's
    // (e.g. no fp16), not a network error, so skip WebGPU on later startups.
    if (webGpuFailed && device === 'wasm' && !options.device) rememberWebGpuUnsupported(model);
    setBrowseEmbeddingProvider(provider);
    try {
      await reindexBrowseEmbeddings();
    } catch (error) {
      // Queries ignore stale vectors, so search still works; the next reindex retries.
      console.warn('Browser semantic search reindex failed.', error);
    }
    console.info(`Browser semantic search enabled with ${device}.`);
    return true;
  }
  console.warn('Browser semantic search unavailable; retaining the local baseline embedding.', lastError);
  return false;
}

let semanticSearchPromise: Promise<boolean> | null = null;

/** Load the semantic model at most once, whether from startup warmup or a search. */
export function ensureBrowserSemanticSearch(): Promise<boolean> {
  semanticSearchPromise ??= enableBrowserSemanticSearch();
  return semanticSearchPromise;
}
