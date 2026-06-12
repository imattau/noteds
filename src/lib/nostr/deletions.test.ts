import { describe, expect, it } from 'vitest';
import { getDeletedEventIds } from './deletions';

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
