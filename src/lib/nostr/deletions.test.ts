import { describe, expect, it } from 'vitest';
import { getDeletedEventIds, getDeletionKeys, isDeletionKey } from './deletions';

describe('getDeletedEventIds', () => {
  it('extracts deleted event ids from e tags', () => {
    expect(
      getDeletedEventIds({
        tags: [
          ['e', 'event-a'],
          ['p', 'pubkey'],
          ['e', 'event-b']
        ]
      } as any)
    ).toEqual(['event-a', 'event-b']);
  });

  it('ignores non e tags and empty values', () => {
    expect(
      getDeletedEventIds({
        tags: [
          ['e', ''],
          ['t', 'category']
        ]
      } as any)
    ).toEqual([]);
  });
});

describe('getDeletionKeys', () => {
  it('scopes each deleted event id to the deletion author', () => {
    expect(
      getDeletionKeys({ pubkey: 'author', tags: [['e', 'event-a'], ['e', 'event-b']] } as any)
    ).toEqual(['author:event-a', 'author:event-b']);
  });
});

describe('isDeletionKey', () => {
  it('accepts author-scoped keys and rejects bare event ids', () => {
    expect(isDeletionKey('author:event-a')).toBe(true);
    expect(isDeletionKey('event-a')).toBe(false);
    expect(isDeletionKey(':event-a')).toBe(false);
    expect(isDeletionKey('author:')).toBe(false);
    expect(isDeletionKey(42)).toBe(false);
  });
});
