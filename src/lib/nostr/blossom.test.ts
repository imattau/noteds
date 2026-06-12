import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./signer', () => ({
  signer: {
    signEvent: vi.fn(async (event) => ({
      ...event,
      pubkey: 'a'.repeat(64),
      id: 'b'.repeat(64),
      sig: 'c'.repeat(128)
    }))
  }
}));

import { buildBlossomAuthEvent, uploadToBlossomServers } from './blossom';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('buildBlossomAuthEvent', () => {
  it('returns a kind 24242 event with u and method tags', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    expect(event.kind).toBe(24242);
    expect(event.tags).toContainEqual(['u', 'https://blossom.example/upload']);
    expect(event.tags).toContainEqual(['method', 'PUT']);
  });

  it('includes an x tag when sha256Hex is provided', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT', 'deadbeef');
    expect(event.tags).toContainEqual(['x', 'deadbeef']);
  });

  it('omits the x tag when sha256Hex is not provided', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    expect(event.tags.find(([tag]) => tag === 'x')).toBeUndefined();
  });

  it('sets an expiration tag in the future', () => {
    const before = Math.floor(Date.now() / 1000);
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    const expirationTag = event.tags.find(([tag]) => tag === 'expiration');
    expect(expirationTag).toBeDefined();
    expect(Number(expirationTag?.[1])).toBeGreaterThan(before);
  });
});

describe('uploadToBlossomServers', () => {
  it('returns the successful upload urls from the servers that worked', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    const result = await uploadToBlossomServers(file, ['https://bad.example', 'https://good.example'], async (_file, server) => {
      if (server === 'https://good.example') {
        return 'https://good.example/upload/blob-123';
      }
      throw new Error('Upload failed');
    });
    expect(result).toEqual({
      url: 'https://good.example/upload/blob-123',
      sources: ['https://good.example/upload/blob-123']
    });
  });
});
