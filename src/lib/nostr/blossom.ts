import type { EventTemplate } from 'nostr-tools';
import { signer } from './signer';

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

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadToBlossom(file: File, serverUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256Hex = bufferToHex(digest);

  const uploadUrl = `${serverUrl}/upload`;
  const template = buildBlossomAuthEvent(uploadUrl, 'PUT', sha256Hex);
  const signedEvent = await signer.signEvent(template);
  const authHeader = `Nostr ${btoa(JSON.stringify(signedEvent))}`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'Content-Type': file.type
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Blossom upload failed with status ${response.status}`);
  }

  const json = (await response.json()) as { url?: string };
  if (!json.url) {
    throw new Error('Blossom server response did not include a url.');
  }

  return json.url;
}
