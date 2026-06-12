import { describe, expect, it } from 'vitest';
import { decodeOwnedListingIndex, encodeOwnedListingIndex } from './ownedListings';

describe('owned listings index', () => {
  it('encodes a deduplicated id list', () => {
    expect(encodeOwnedListingIndex(['one', 'two', 'one', ''])).toBe(
      JSON.stringify({ version: 1, ids: ['one', 'two'] })
    );
  });

  it('decodes an encoded id list', () => {
    const encoded = JSON.stringify({ version: 1, ids: ['one', 'two'] });
    expect(decodeOwnedListingIndex(encoded)).toEqual(['one', 'two']);
  });

  it('returns an empty list for invalid content', () => {
    expect(decodeOwnedListingIndex('not-json')).toEqual([]);
    expect(decodeOwnedListingIndex(JSON.stringify({ version: 2, ids: ['one'] }))).toEqual([]);
  });
});
