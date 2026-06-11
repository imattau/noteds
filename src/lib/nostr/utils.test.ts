import { describe, expect, it } from 'vitest';
import { getA, getTagOr, unique } from './utils';

describe('unique', () => {
  it('merges arrays and removes duplicates, preserving order', () => {
    expect(unique(['a', 'b'], ['b', 'c'], ['a', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns empty array for no input', () => {
    expect(unique()).toEqual([]);
  });
});

describe('getTagOr', () => {
  it('returns the tag value when present', () => {
    const event = { tags: [['title', 'Bike']] } as any;
    expect(getTagOr(event, 'title')).toBe('Bike');
  });

  it('returns the default when tag is absent', () => {
    const event = { tags: [] } as any;
    expect(getTagOr(event, 'title', 'Untitled')).toBe('Untitled');
  });
});

describe('getA', () => {
  it('builds the kind:pubkey:d-tag address', () => {
    const event = { kind: 30402, pubkey: 'abc123', tags: [['d', 'my-id']] } as any;
    expect(getA(event)).toBe('30402:abc123:my-id');
  });

  it('uses an empty d-tag when missing', () => {
    const event = { kind: 30402, pubkey: 'abc123', tags: [] } as any;
    expect(getA(event)).toBe('30402:abc123:');
  });
});
