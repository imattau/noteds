import { filterSecureRelays } from './security';
import { unique } from './utils';

const CUSTOM_RELAYS_KEY = 'noteds:custom-relays';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://purplepag.es'
];

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
