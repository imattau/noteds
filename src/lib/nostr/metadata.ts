import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import { getProfileRelays } from './relays';
import { collectEvents } from './requestEvents';
import { eventStore, relayPool } from './runtime';

const PROFILE_CACHE_KEY = 'noteds:profiles:v2';
const LEGACY_PROFILE_CACHE_PREFIX = 'noteds:profile:';
const PROFILE_LOAD_TIMEOUT_MS = 2500;
/** Lookups made within this window share one relay request. */
const PROFILE_BATCH_DELAY_MS = 25;
const PROFILE_BATCH_MAX_AUTHORS = 100;
/** Cached profiles are served immediately and refreshed in the background after this. */
const PROFILE_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
/** Pubkeys without a profile are re-checked at most this often. */
const MISSING_PROFILE_RETRY_AFTER_MS = 60 * 60 * 1000;
const MAX_CACHED_PROFILES = 500;
const PROFILE_CACHE_WRITE_DEBOUNCE_MS = 500;

export interface NostrUser {
  pubkey: string;
  npub: string;
  metadata: {
    name?: string;
    display_name?: string;
    picture?: string;
  } | null;
}

interface CachedProfile {
  user: NostrUser;
  fetchedAt: number;
}

type ProfileMetadata = NostrUser['metadata'];

function isOptionalString(value: unknown): boolean {
  return typeof value === 'undefined' || typeof value === 'string';
}

function isValidUser(value: unknown, pubkey: string): value is NostrUser {
  const user = value as Partial<NostrUser> | null;
  if (!user || user.pubkey !== pubkey || typeof user.npub !== 'string') return false;
  if (user.metadata === null) return true;
  return (
    typeof user.metadata === 'object' &&
    user.metadata !== undefined &&
    isOptionalString(user.metadata.name) &&
    isOptionalString(user.metadata.display_name) &&
    isOptionalString(user.metadata.picture)
  );
}

// In-memory LRU mirror of the localStorage cache: Map order is least to most
// recently used, so the newest entries survive the size cap.
let profileCache: Map<string, CachedProfile> | null = null;
let profileCacheWriteTimer: ReturnType<typeof setTimeout> | null = null;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function getProfileCache(): Map<string, CachedProfile> {
  if (profileCache) return profileCache;
  profileCache = new Map();
  if (!canUseStorage()) return profileCache;

  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      for (const entry of parsed as Array<Partial<CachedProfile>>) {
        const pubkey = entry?.user?.pubkey;
        if (typeof pubkey === 'string' && typeof entry.fetchedAt === 'number' && isValidUser(entry.user, pubkey)) {
          profileCache.set(pubkey, { user: entry.user, fetchedAt: entry.fetchedAt });
        }
      }
    }
  } catch {
    // A corrupt cache is rebuilt from relays.
  }
  migrateLegacyProfiles(profileCache);
  return profileCache;
}

/** Fold the old one-key-per-profile entries into the bounded cache and remove them. */
function migrateLegacyProfiles(cache: Map<string, CachedProfile>): void {
  try {
    const legacyKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(LEGACY_PROFILE_CACHE_PREFIX)) legacyKeys.push(key);
    }
    if (legacyKeys.length === 0) return;

    for (const key of legacyKeys) {
      const pubkey = key.slice(LEGACY_PROFILE_CACHE_PREFIX.length);
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
        // fetchedAt 0 marks these stale, so they refresh in the background on next use.
        if (!cache.has(pubkey) && isValidUser(parsed, pubkey)) cache.set(pubkey, { user: parsed, fetchedAt: 0 });
      } catch {
        // Skip unreadable legacy entries.
      }
      localStorage.removeItem(key);
    }
    scheduleProfileCacheWrite();
  } catch {
    // Best effort.
  }
}

function writeProfileCache(): void {
  profileCacheWriteTimer = null;
  if (!profileCache || !canUseStorage()) return;
  while (profileCache.size > MAX_CACHED_PROFILES) {
    const oldest = profileCache.keys().next().value;
    if (oldest === undefined) break;
    profileCache.delete(oldest);
  }
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(Array.from(profileCache.values())));
  } catch {
    // Quota errors leave the in-memory cache working for this session.
  }
}

function scheduleProfileCacheWrite(): void {
  if (profileCacheWriteTimer) return;
  profileCacheWriteTimer = setTimeout(writeProfileCache, PROFILE_CACHE_WRITE_DEBOUNCE_MS);
}

function setCachedProfile(pubkey: string, entry: CachedProfile): void {
  const cache = getProfileCache();
  cache.delete(pubkey);
  cache.set(pubkey, entry);
  scheduleProfileCacheWrite();
}

function parseProfileEvent(event: NostrEvent): ProfileMetadata {
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

const inFlightProfiles = new Map<string, Promise<ProfileMetadata>>();
let pendingProfileBatch = new Map<string, (metadata: ProfileMetadata) => void>();
let profileBatchTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchProfileBatch(pubkeys: string[], resolvers: Map<string, (metadata: ProfileMetadata) => void>) {
  try {
    const relays = getProfileRelays();
    if (relays.length > 0) {
      const events = await collectEvents(
        relayPool.request(relays, { kinds: [0], authors: pubkeys }),
        PROFILE_LOAD_TIMEOUT_MS
      );
      for (const event of events) {
        eventStore.add(event);
      }
    }
  } catch (error) {
    console.warn('Profile batch request failed', error);
  }
  for (const pubkey of pubkeys) {
    const bestEvent = eventStore.getReplaceable(0, pubkey);
    resolvers.get(pubkey)?.(bestEvent ? parseProfileEvent(bestEvent) : null);
    inFlightProfiles.delete(pubkey);
  }
}

function flushProfileBatch(): void {
  profileBatchTimer = null;
  const batch = pendingProfileBatch;
  pendingProfileBatch = new Map();
  const pubkeys = Array.from(batch.keys());
  for (let index = 0; index < pubkeys.length; index += PROFILE_BATCH_MAX_AUTHORS) {
    void fetchProfileBatch(pubkeys.slice(index, index + PROFILE_BATCH_MAX_AUTHORS), batch);
  }
}

/** Fetch kind 0 metadata, sharing in-flight lookups and batching nearby ones. */
function requestProfileMetadata(pubkey: string): Promise<ProfileMetadata> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const inFlight = inFlightProfiles.get(pubkey);
  if (inFlight) return inFlight;

  const promise = new Promise<ProfileMetadata>((resolve) => {
    pendingProfileBatch.set(pubkey, resolve);
  });
  inFlightProfiles.set(pubkey, promise);
  profileBatchTimer ??= setTimeout(flushProfileBatch, PROFILE_BATCH_DELAY_MS);
  return promise;
}

async function refreshNostrUser(pubkey: string, previous: CachedProfile | undefined): Promise<NostrUser> {
  const metadata = await requestProfileMetadata(pubkey);
  const now = Date.now();
  if (!metadata && previous?.user.metadata) {
    // A failed or empty lookup shouldn't erase a known profile; keep it and
    // try again after the missing-profile interval instead of a full day.
    setCachedProfile(pubkey, {
      user: previous.user,
      fetchedAt: now - PROFILE_REFRESH_AFTER_MS + MISSING_PROFILE_RETRY_AFTER_MS
    });
    return previous.user;
  }
  const user: NostrUser = { pubkey, npub: previous?.user.npub ?? nip19.npubEncode(pubkey), metadata };
  setCachedProfile(pubkey, { user, fetchedAt: now });
  return user;
}

export async function loadNostrUser(pubkey: string): Promise<NostrUser> {
  const cached = getProfileCache().get(pubkey);
  if (cached) {
    const age = Date.now() - cached.fetchedAt;
    if (cached.user.metadata) {
      // Stale-while-revalidate: profiles rarely change, so never block on them.
      if (age >= PROFILE_REFRESH_AFTER_MS) void refreshNostrUser(pubkey, cached);
      return cached.user;
    }
    if (age < MISSING_PROFILE_RETRY_AFTER_MS) return cached.user;
  }
  return refreshNostrUser(pubkey, cached);
}

export function resetProfileCacheForTests(): void {
  profileCache = null;
  if (profileCacheWriteTimer) clearTimeout(profileCacheWriteTimer);
  profileCacheWriteTimer = null;
  if (profileBatchTimer) clearTimeout(profileBatchTimer);
  profileBatchTimer = null;
  pendingProfileBatch = new Map();
  inFlightProfiles.clear();
}
