import type { NostrEvent, EventTemplate } from 'nostr-tools';
import { getActiveRelays } from './relays';
import { collectEvents } from './requestEvents';
import { eventStore, relayPool } from './runtime';
import { signer } from './signer';

export const OWNED_LISTINGS_KIND = 30000;
export const OWNED_LISTINGS_D_TAG = 'owned-listings';
export const OWNED_LISTINGS_LOAD_TIMEOUT_MS = 5000;
export const OWNED_LISTINGS_LOAD_RETRY_DELAY_MS = 750;
export const OWNED_LISTINGS_LOAD_RETRY_ATTEMPTS = 2;

interface OwnedListingIndexPayload {
  version: 1;
  ids: string[];
}

function normalizeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

export function encodeOwnedListingIndex(ids: string[]): string {
  const payload: OwnedListingIndexPayload = {
    version: 1,
    ids: normalizeIds(ids)
  };
  return JSON.stringify(payload);
}

export function decodeOwnedListingIndex(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as Partial<OwnedListingIndexPayload>;
    if (parsed.version !== 1 || !Array.isArray(parsed.ids)) {
      return [];
    }
    return normalizeIds(parsed.ids.filter((id): id is string => typeof id === 'string'));
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishOwnedListingIndex(pubkey: string, ids: string[]): Promise<NostrEvent> {
  const content = await signer.nip44.encrypt(pubkey, encodeOwnedListingIndex(ids));
  const template: EventTemplate = {
    kind: OWNED_LISTINGS_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [
      ['d', OWNED_LISTINGS_D_TAG],
      ['title', 'Owned listings']
    ]
  };
  const event = await signer.signEvent(template);
  await relayPool.publish(getActiveRelays(), event);
  return event;
}

async function loadOwnedListingIdsOnce(pubkey: string): Promise<string[] | null> {
  const events = await collectEvents(
    relayPool.request(getActiveRelays(), {
      kinds: [OWNED_LISTINGS_KIND],
      authors: [pubkey],
      '#d': [OWNED_LISTINGS_D_TAG]
    }),
    OWNED_LISTINGS_LOAD_TIMEOUT_MS
  );

  for (const event of events) {
    eventStore.add(event);
  }

  const latest = eventStore.getReplaceable(OWNED_LISTINGS_KIND, pubkey, OWNED_LISTINGS_D_TAG);
  if (!latest) return null;

  const trimmed = latest.content.trim();
  if (trimmed.startsWith('{')) {
    return decodeOwnedListingIndex(trimmed);
  }

  try {
    const decrypted = await signer.nip44.decrypt(pubkey, latest.content);
    return decodeOwnedListingIndex(decrypted);
  } catch (error) {
    console.error('Failed to decrypt owned listing index', error);
    return [];
  }
}

let cachedOwnedIds: Record<string, string[]> = {};

export function getCachedOwnedListingIds(pubkey: string): string[] | null {
  return cachedOwnedIds[pubkey] ?? null;
}

export async function loadOwnedListingIds(pubkey: string): Promise<string[] | null> {
  let lastResult: string[] | null = null;

  for (let attempt = 0; attempt < OWNED_LISTINGS_LOAD_RETRY_ATTEMPTS; attempt += 1) {
    lastResult = await loadOwnedListingIdsOnce(pubkey);
    if (lastResult !== null) {
      cachedOwnedIds[pubkey] = lastResult;
      return lastResult;
    }

    if (attempt < OWNED_LISTINGS_LOAD_RETRY_ATTEMPTS - 1) {
      await sleep(OWNED_LISTINGS_LOAD_RETRY_DELAY_MS);
    }
  }

  return lastResult;
}

export async function replaceOwnedListingIds(pubkey: string, ids: string[]): Promise<string[]> {
  const normalized = normalizeIds(ids);
  cachedOwnedIds[pubkey] = normalized;
  await publishOwnedListingIndex(pubkey, normalized);
  return normalized;
}

export async function upsertOwnedListingId(pubkey: string, id: string): Promise<string[]> {
  const existing = getCachedOwnedListingIds(pubkey) ?? (await loadOwnedListingIds(pubkey)) ?? [];
  if (existing.includes(id)) {
    return existing;
  }
  return replaceOwnedListingIds(pubkey, [...existing, id]);
}

export async function removeOwnedListingId(pubkey: string, id: string): Promise<string[]> {
  const existing = getCachedOwnedListingIds(pubkey) ?? (await loadOwnedListingIds(pubkey)) ?? [];
  return replaceOwnedListingIds(pubkey, existing.filter((entry) => entry !== id));
}

