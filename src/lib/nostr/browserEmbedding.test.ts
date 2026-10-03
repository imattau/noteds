import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./browseCacheStore', () => ({
  setBrowseEmbeddingProvider: vi.fn(),
  reindexBrowseEmbeddings: vi.fn(async () => undefined)
}));

import { enableBrowserSemanticSearch } from './browserEmbedding';

const devicesTried: string[] = [];
let failingDevices = new Set<string>();

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;

  postMessage({ id, device }: { id: number; device: string }) {
    devicesTried.push(device);
    const data = failingDevices.has(device)
      ? { id, error: `The device (${device}) does not support fp16.` }
      : { id, vector: [0.1, 0.2] };
    queueMicrotask(() => this.onmessage?.({ data }));
  }

  terminate() {
    this.terminated = true;
  }
}

describe('enableBrowserSemanticSearch', () => {
  beforeEach(() => {
    localStorage.clear();
    devicesTried.length = 0;
    failingDevices = new Set(['webgpu']);
    vi.stubGlobal('Worker', FakeWorker);
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as { gpu?: unknown }).gpu;
  });

  it('skips WebGPU on later startups once WASM succeeds after it failed', async () => {
    expect(await enableBrowserSemanticSearch()).toBe(true);
    expect(devicesTried).toEqual(['webgpu', 'wasm']);

    devicesTried.length = 0;
    expect(await enableBrowserSemanticSearch()).toBe(true);
    expect(devicesTried).toEqual(['wasm']);
  });

  it('does not remember WebGPU as unsupported when every device fails', async () => {
    failingDevices = new Set(['webgpu', 'wasm']);
    expect(await enableBrowserSemanticSearch()).toBe(false);

    failingDevices = new Set();
    devicesTried.length = 0;
    expect(await enableBrowserSemanticSearch()).toBe(true);
    expect(devicesTried).toEqual(['webgpu']);
  });

  it('retries WebGPU after the remembered failure expires', async () => {
    await enableBrowserSemanticSearch();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 24 * 60 * 60 * 1000);

    devicesTried.length = 0;
    await enableBrowserSemanticSearch();
    expect(devicesTried[0]).toBe('webgpu');
  });
});
