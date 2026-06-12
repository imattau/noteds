import { RelayPool } from 'applesauce-relay';
import type { NostrEvent } from 'nostr-tools';

import { unique } from './utils';
import { isSecureRelayUrl } from './security';
import { getActiveRelays, getCustomRelays, setCustomRelays } from './relays';

const preferenceRelayPool = new RelayPool();

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

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  if (!parsed.hostname || parsed.hostname === 'undefined' || parsed.hostname === 'null') {
    return null;
  }

  return parsed.toString();
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
      .filter((url): url is string => isSecureRelayUrl(url))
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

  return await new Promise<NostrEvent | null>((resolve) => {
    let bestEvent: NostrEvent | null = null;
    let finished = false;

    const finish = (event: NostrEvent | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
      resolve(event);
    };

    const timeout = setTimeout(() => finish(bestEvent), 2500);

    const subscription = preferenceRelayPool
      .subscription(relays, {
        kinds: [kind],
        authors: [pubkey]
      })
      .subscribe((response: any) => {
        if (response === 'EOSE') {
          finish(bestEvent);
          return;
        }

        const event = response as NostrEvent;
        if (!bestEvent || event.created_at > bestEvent.created_at) {
          bestEvent = event;
        }
      });
  });
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

  const currentRelays = getCustomRelays();
  if (currentRelays.length === 0) {
    const userRelays = await loadUserRelayList(pubkey);
    if (userRelays.length > 0) {
      setCustomRelays(userRelays);
    }
  }

  const currentBlossomServers = getCustomBlossomServers();
  if (currentBlossomServers.length === 0) {
    const userBlossomServers = await loadUserBlossomServers(pubkey);
    if (userBlossomServers.length > 0) {
      setCustomBlossomServers(userBlossomServers);
    }
  }
}
