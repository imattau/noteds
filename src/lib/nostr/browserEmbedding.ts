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

/** Create a lazy Web Worker-backed Transformers.js embedding provider. */
export function createBrowserEmbeddingProvider(options: BrowserEmbeddingOptions = {}): BrowseEmbeddingProvider {
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
    }
  };
}

/** Warm the model off the main UI path, then switch graph ranking to it. */
export async function enableBrowserSemanticSearch(options: BrowserEmbeddingOptions = {}): Promise<boolean> {
  const devices: Array<BrowserEmbeddingOptions['device']> = options.device
    ? [options.device]
    : typeof navigator !== 'undefined' && 'gpu' in navigator
      ? ['webgpu', 'wasm']
      : ['wasm'];
  let lastError: unknown;
  for (const device of devices) {
    try {
      const provider = createBrowserEmbeddingProvider({ ...options, device });
      await provider.embed('semantic search warmup');
      setBrowseEmbeddingProvider(provider);
      await reindexBrowseEmbeddings();
      console.info(`Browser semantic search enabled with ${device}.`);
      return true;
    } catch (error) {
      lastError = error;
      console.warn(`Browser semantic search ${device} provider unavailable; trying the next fallback.`, error);
    }
  }
  console.warn('Browser semantic search unavailable; retaining the local baseline embedding.', lastError);
  return false;
}
