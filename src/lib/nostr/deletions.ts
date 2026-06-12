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
