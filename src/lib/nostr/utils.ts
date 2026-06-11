import type { NostrEvent } from 'nostr-tools';

export function unique<A>(...arrs: A[][]): A[] {
  const result: A[] = [];
  for (const arr of arrs) {
    for (const item of arr) {
      if (!result.includes(item)) {
        result.push(item);
      }
    }
  }
  return result;
}

export function getTagOr(event: NostrEvent, tagName: string, dflt = ''): string {
  return event.tags.find(([tag]) => tag === tagName)?.[1] || dflt;
}

export function getAllTags(event: NostrEvent, tagName: string): string[] {
  return event.tags.filter(([tag]) => tag === tagName).map(([, value]) => value);
}

export function getA(event: NostrEvent): string {
  const dTag = event.tags.find(([tag, value]) => tag === 'd' && value)?.[1] || '';
  return `${event.kind}:${event.pubkey}:${dTag}`;
}
