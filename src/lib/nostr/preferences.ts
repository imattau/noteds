import { RelayPool } from 'applesauce-relay';
import type { NostrEvent } from 'nostr-tools';
import { normalizeRelayUrl, normalizeURL } from 'applesauce-core/helpers';

import { unique } from './utils';
import { getActiveRelays, getCustomRelays, setCustomRelays } from './relays';
import { collectEvents } from './requestEvents';
import { eventStore } from './runtime';

const preferenceRelayPool = new RelayPool();
const PREFERENCE_LOAD_TIMEOUT_MS = 2500;

const CUSTOM_BLOSSOM_SERVERS_KEY = 'noteds:custom-blossom-servers';
const LEGACY_BLOSSOM_SERVER_KEY = 'noteds:blossom-server';

export const DEFAULT_BLOSSOM_SERVERS: readonly string[] = ['https://blossom.primal.net'];

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function sanitizeBlossomServerUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || parsed.hostname === 'undefined' || parsed.hostname === 'null') {
      return null;
    }
    return normalizeURL(parsed.toString());
  } catch {
    return null;
  }
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function loadStoredBlossomServers(): string[] {
  if (!isBrowser()) return [];

  const stored = localStorage.getItem(CUSTOM_BLOSSOM_SERVERS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return filterSecureBlossomServers(parsed);
      }
    } catch {
      return [];
    }
  }

  const legacyStored = localStorage.getItem(LEGACY_BLOSSOM_SERVER_KEY);
  if (legacyStored) {
    const sanitized = sanitizeBlossomServerUrl(legacyStored);
    return sanitized ? [sanitized] : [];
  }

  return [];
}

export function filterSecureBlossomServers(servers: string[]): string[] {
  return servers
    .map((url) => sanitizeBlossomServerUrl(url))
    .filter((url): url is string => url !== null);
}

export function getCustomBlossomServers(): string[] {
  return loadStoredBlossomServers();
}

export function setCustomBlossomServers(servers: string[]): void {
  if (!isBrowser()) return;
  const sanitized = filterSecureBlossomServers(servers);
  localStorage.setItem(CUSTOM_BLOSSOM_SERVERS_KEY, JSON.stringify(sanitized));
  if (sanitized.length > 0) {
    localStorage.setItem(LEGACY_BLOSSOM_SERVER_KEY, sanitized[0]);
  } else {
    localStorage.removeItem(LEGACY_BLOSSOM_SERVER_KEY);
  }
}

export function getActiveBlossomServers(): string[] {
  return unique(getCustomBlossomServers(), [...DEFAULT_BLOSSOM_SERVERS]);
}

export function parseRelayListEvent(event: NostrEvent): string[] {
  return normalizeStringList(
    event.tags
      .filter((tag) => tag[0] === 'r' && typeof tag[1] === 'string')
      .map((tag) => tag[1])
      .filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
        } catch {
          return false;
        }
      })
      .map((url) => normalizeRelayUrl(url))
  );
}

export function parseBlossomServerListEvent(event: NostrEvent): string[] {
  return normalizeStringList(
    event.tags
      .filter((tag) => tag[0] === 'server' && typeof tag[1] === 'string')
      .map((tag) => tag[1])
      .filter((url): url is string => sanitizeBlossomServerUrl(url) !== null)
      .map((url) => sanitizeBlossomServerUrl(url)!)
  );
}

async function loadLatestReplaceableEvent(pubkey: string, kind: number): Promise<NostrEvent | null> {
  if (typeof window === 'undefined') return null;

  const relays = getActiveRelays();
  if (relays.length === 0) return null;

  const events = await collectEvents(
    preferenceRelayPool.request(relays, {
      kinds: [kind],
      authors: [pubkey]
    }),
    PREFERENCE_LOAD_TIMEOUT_MS
  );

  for (const event of events) {
    eventStore.add(event);
  }

  return eventStore.getReplaceable(kind, pubkey) ?? null;
}

export async function loadUserRelayList(pubkey: string): Promise<string[]> {
  const event = await loadLatestReplaceableEvent(pubkey, 10002);
  return event ? parseRelayListEvent(event) : [];
}

export async function loadUserBlossomServers(pubkey: string): Promise<string[]> {
  const event = await loadLatestReplaceableEvent(pubkey, 10096);
  return event ? parseBlossomServerListEvent(event) : [];
}

export async function hydratePreferencesFromNostr(pubkey: string): Promise<void> {
  if (!isBrowser()) return;

  const [userRelays, userBlossomServers] = await Promise.all([
    loadUserRelayList(pubkey),
    loadUserBlossomServers(pubkey)
  ]);

  if (userRelays.length > 0) {
    setCustomRelays(userRelays);
  }

  if (userBlossomServers.length > 0) {
    setCustomBlossomServers(userBlossomServers);
  }
}
