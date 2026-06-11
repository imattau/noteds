import { describe, expect, it } from 'vitest';
import { buildListingFilter } from './feed';

describe('buildListingFilter', () => {
  it('returns just the kind filter when no options are given', () => {
    expect(buildListingFilter({})).toEqual({ kinds: [30402] });
  });

  it('includes #t when categories are given', () => {
    expect(buildListingFilter({ categories: ['bicycles', 'furniture'] })).toEqual({
      kinds: [30402],
      '#t': ['bicycles', 'furniture']
    });
  });

  it('includes #g when geohashPrefix is given', () => {
    expect(buildListingFilter({ geohashPrefix: '9v6kp' })).toEqual({
      kinds: [30402],
      '#g': ['9v6kp']
    });
  });

  it('includes since when given', () => {
    expect(buildListingFilter({ since: 1000 })).toEqual({ kinds: [30402], since: 1000 });
  });

  it('combines all options together', () => {
    expect(buildListingFilter({ categories: ['bicycles'], geohashPrefix: '9v6kp', since: 1000 })).toEqual({
      kinds: [30402],
      '#t': ['bicycles'],
      '#g': ['9v6kp'],
      since: 1000
    });
  });

  it('omits #t for an empty categories array', () => {
    expect(buildListingFilter({ categories: [] })).toEqual({ kinds: [30402] });
  });
});
