import { filterSecureRelays } from './security';
import { unique } from './utils';

const CUSTOM_RELAYS_KEY = 'noteds:custom-relays';

// General-purpose relays that accept and serve listings (kind 30402),
// deletions, reviews and DMs. Checked live 2026-10-03; relay.nostr.band no
// longer accepted connections.
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://offchain.pub'
];

/**
 * Indexer relays that only store profiles and relay lists (kinds 0, 3, 10002).
 * Kept out of DEFAULT_RELAYS so listing, DM and review traffic doesn't open
 * sockets to relays that can't answer it.
 */
export const PROFILE_INDEX_RELAYS = ['wss://purplepag.es'];

export function getCustomRelays(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(CUSTOM_RELAYS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return filterSecureRelays(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return [];
  }
}

export function setCustomRelays(relays: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_RELAYS_KEY, JSON.stringify(filterSecureRelays(relays)));
}

export function getActiveRelays(): string[] {
  return unique(getCustomRelays(), DEFAULT_RELAYS);
}

/** Relays for kind 0 profile lookups: the active set plus profile indexers. */
export function getProfileRelays(): string[] {
  return unique(getActiveRelays(), PROFILE_INDEX_RELAYS);
}
