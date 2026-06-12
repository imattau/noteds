import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import { firstValueFrom, of } from 'rxjs';
import { catchError, defaultIfEmpty, timeout, toArray } from 'rxjs/operators';
import { getActiveRelays } from './relays';

const PROFILE_CACHE_PREFIX = 'noteds:profile:';
const PROFILE_LOAD_TIMEOUT_MS = 2500;

export interface NostrUser {
  pubkey: string;
  npub: string;
  metadata: {
    name?: string;
    display_name?: string;
    picture?: string;
  } | null;
}

function readCachedUser(pubkey: string): NostrUser | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${pubkey}`);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as NostrUser;
    if (
      parsed &&
      parsed.pubkey === pubkey &&
      typeof parsed.npub === 'string' &&
      (parsed.metadata === null ||
        (typeof parsed.metadata === 'object' &&
          parsed.metadata !== null &&
          (typeof parsed.metadata.name === 'undefined' || typeof parsed.metadata.name === 'string') &&
          (typeof parsed.metadata.display_name === 'undefined' || typeof parsed.metadata.display_name === 'string') &&
          (typeof parsed.metadata.picture === 'undefined' || typeof parsed.metadata.picture === 'string')))
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function storeCachedUser(user: NostrUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${PROFILE_CACHE_PREFIX}${user.pubkey}`, JSON.stringify(user));
}

function parseProfileEvent(event: NostrEvent): NostrUser['metadata'] {
  try {
    const parsed = JSON.parse(event.content) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const metadata = {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      display_name: typeof parsed.display_name === 'string' ? parsed.display_name : undefined,
      picture: typeof parsed.picture === 'string' ? parsed.picture : undefined
    };
    return metadata.name || metadata.display_name || metadata.picture ? metadata : null;
  } catch {
    return null;
  }
}

async function fetchProfileMetadata(pubkey: string): Promise<NostrUser['metadata']> {
  if (typeof window === 'undefined') return null;

  const { eventStore, relayPool } = await import('./signer');
  const relays = getActiveRelays();
  if (relays.length === 0) return null;

  const events = await firstValueFrom(
    relayPool
      .request(relays, {
        kinds: [0],
        authors: [pubkey]
      })
      .pipe(
        toArray(),
        timeout(PROFILE_LOAD_TIMEOUT_MS),
        catchError(() => of<NostrEvent[]>([])),
        defaultIfEmpty([] as NostrEvent[])
      )
  );

  for (const event of events) {
    eventStore.add(event);
  }

  const bestEvent = eventStore.getReplaceable(0, pubkey);
  return bestEvent ? parseProfileEvent(bestEvent) : null;
}

export async function loadNostrUser(pubkey: string): Promise<NostrUser> {
  const cached = readCachedUser(pubkey);
  if (cached?.metadata?.name || cached?.metadata?.display_name || cached?.metadata?.picture) {
    return cached;
  }

  const baseUser: NostrUser = {
    pubkey,
    npub: nip19.npubEncode(pubkey),
    metadata: cached?.metadata ?? null
  };

  const metadata = await fetchProfileMetadata(pubkey);
  const user = metadata ? { ...baseUser, metadata } : baseUser;
  storeCachedUser(user);
  return user;
}
