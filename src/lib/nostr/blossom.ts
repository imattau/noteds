import { BlossomClient } from 'nostr-tools/nipb7';
import type { EventTemplate } from 'nostr-tools';
import type { Signer } from 'nostr-tools/signer';
import { signer } from './signer';

export interface BlossomUploadResult {
  url: string;
  sources: string[];
}

export function buildBlossomAuthEvent(url: string, method: string, sha256Hex?: string): EventTemplate {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: 24242,
    created_at: now,
    content: 'Upload',
    tags: [
      ['u', url],
      ['method', method],
      ['expiration', String(now + 60)],
      ...(sha256Hex ? [['x', sha256Hex]] : [])
    ]
  };
}

export async function uploadToBlossom(file: File, serverUrl: string): Promise<string> {
  const client = new BlossomClient(serverUrl, signer as unknown as Signer);
  const descriptor = await client.uploadFile(file);
  return descriptor.url;
}

export async function uploadToBlossomServers(
  file: File,
  serverUrls: string[],
  uploadFn: (file: File, serverUrl: string) => Promise<string> = uploadToBlossom
): Promise<BlossomUploadResult> {
  const uniqueServers = [...new Set(serverUrls.filter((server) => typeof server === 'string' && server.length > 0))];
  if (uniqueServers.length === 0) {
    throw new Error('No Blossom servers are available.');
  }

  const results = await Promise.allSettled(uniqueServers.map(async (server) => ({ server, url: await uploadFn(file, server) })));

  const successful = results
    .filter((result): result is PromiseFulfilledResult<{ server: string; url: string }> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (successful.length === 0) {
    throw new Error('Blossom upload failed on all available servers.');
  }

  return {
    url: successful[0].url,
    sources: successful.map((result) => result.url)
  };
}
