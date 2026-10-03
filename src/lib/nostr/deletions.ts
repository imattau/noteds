import type { NostrEvent } from 'nostr-tools';

export function getDeletedEventIds(event: NostrEvent): string[] {
  return event.tags
    .filter(([tag]) => tag === 'e')
    .map((tag) => tag[1])
    .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0);
}

export function getDeletedAddresses(event: NostrEvent): string[] {
  return event.tags
    .filter(([tag]) => tag === 'a')
    .map((tag) => tag[1])
    .filter((address): address is string => typeof address === 'string' && address.length > 0);
}

/**
 * Identifies a deletion by who issued it and which event it targets. NIP-09
 * deletions only apply to the issuer's own events, so a key only ever matches
 * a listing whose author is the deletion's author.
 */
export function deletionKey(pubkey: string, eventId: string): string {
  return `${pubkey}:${eventId}`;
}

/** Deletion keys for the event ids a kind 5 event targets, scoped to its author. */
export function getDeletionKeys(event: NostrEvent): string[] {
  return getDeletedEventIds(event).map((eventId) => deletionKey(event.pubkey, eventId));
}

/** Keys recorded before deletions carried their author are bare event ids and can't be trusted. */
export function isDeletionKey(value: unknown): value is string {
  return typeof value === 'string' && value.indexOf(':') > 0 && !value.endsWith(':');
}
