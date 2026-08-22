import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import { getActiveRelays } from './relays';
import { collectEvents } from './requestEvents';
import { eventStore, relayPool } from './runtime';

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
    const profile = JSON.parse(event.content);
    if (!profile || typeof profile !== 'object') return null;
    const metadata = {
      name: typeof profile.name === 'string' ? profile.name : undefined,
      display_name: typeof profile.display_name === 'string' ? profile.display_name : undefined,
      picture: typeof profile.picture === 'string' ? profile.picture : undefined
    };
    return metadata.name || metadata.display_name || metadata.picture ? metadata : null;
  } catch (err) {
    console.error('Failed to parse profile content JSON', err);
    return null;
  }
}

async function fetchProfileMetadata(pubkey: string): Promise<NostrUser['metadata']> {
  if (typeof window === 'undefined') return null;

  const relays = getActiveRelays();
  if (relays.length === 0) return null;

  const events = await collectEvents(
    relayPool.request(relays, {
      kinds: [0],
      authors: [pubkey]
    }),
    PROFILE_LOAD_TIMEOUT_MS
  );

  for (const event of events) {
    eventStore.add(event);
  }

  const bestEvent = eventStore.getReplaceable(0, pubkey);
  return bestEvent ? parseProfileEvent(bestEvent) : null;
}

export async function loadNostrUser(pubkey: string): Promise<NostrUser> {
  const cached = readCachedUser(pubkey);
  if (cached && cached.metadata !== null) {
    return cached;
  }

  const baseUser: NostrUser = {
    pubkey,
    npub: nip19.npubEncode(pubkey),
    metadata: cached ? cached.metadata : null
  };

  const metadata = await fetchProfileMetadata(pubkey);
  const user = metadata ? { ...baseUser, metadata } : baseUser;
  storeCachedUser(user);
  return user;
}
