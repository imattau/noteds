import type { NostrEvent, EventTemplate } from 'nostr-tools';
import { firstValueFrom, of } from 'rxjs';
import { catchError, defaultIfEmpty, timeout, toArray } from 'rxjs/operators';
import { getActiveRelays } from './relays';
import { relayPool, signer } from './signer';

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
  const events = await firstValueFrom(
    relayPool
      .request(getActiveRelays(), {
        kinds: [OWNED_LISTINGS_KIND],
        authors: [pubkey],
        '#d': [OWNED_LISTINGS_D_TAG]
      })
      .pipe(
        toArray(),
        timeout(OWNED_LISTINGS_LOAD_TIMEOUT_MS),
        catchError(() => of<NostrEvent[]>([])),
        defaultIfEmpty([] as NostrEvent[])
      )
  );

  let latest: NostrEvent | null = null;
  for (const event of events) {
    if (!latest || event.created_at > latest.created_at) {
      latest = event;
    }
  }

  return latest ? decodeOwnedListingIndex(latest.content) : null;
}

export async function loadOwnedListingIds(pubkey: string): Promise<string[] | null> {
  let lastResult: string[] | null = null;

  for (let attempt = 0; attempt < OWNED_LISTINGS_LOAD_RETRY_ATTEMPTS; attempt += 1) {
    lastResult = await loadOwnedListingIdsOnce(pubkey);
    if (lastResult !== null) {
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
  await publishOwnedListingIndex(pubkey, normalized);
  return normalized;
}

export async function upsertOwnedListingId(pubkey: string, id: string): Promise<string[]> {
  const existing = (await loadOwnedListingIds(pubkey)) ?? [];
  if (existing.includes(id)) {
    return existing;
  }
  return replaceOwnedListingIds(pubkey, [...existing, id]);
}

export async function removeOwnedListingId(pubkey: string, id: string): Promise<string[]> {
  const existing = (await loadOwnedListingIds(pubkey)) ?? [];
  return replaceOwnedListingIds(pubkey, existing.filter((entry) => entry !== id));
}
