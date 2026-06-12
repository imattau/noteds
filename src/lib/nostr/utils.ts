import type { NostrEvent } from 'nostr-tools';
import { createReplaceableAddress, getTagValue } from 'applesauce-core/helpers/event';

export function unique<A>(...arrs: A[][]): A[] {
  const result = new Set<A>();
  for (const arr of arrs) {
    for (const item of arr) {
      result.add(item);
    }
  }
  return [...result];
}

export function getTagOr(event: NostrEvent, tagName: string, dflt = ''): string {
  return getTagValue(event, tagName) ?? dflt;
}

export function getAllTags(event: NostrEvent, tagName: string): string[] {
  return event.tags.filter(([tag]) => tag === tagName).map(([, value]) => value);
}

export function getA(event: NostrEvent): string {
  const dTag = getTagValue(event, 'd') ?? '';
  return createReplaceableAddress(event.kind, event.pubkey, dTag);
}
