import { describe, expect, it } from 'vitest';
import { filtersToSearchParams, parseFiltersFromSearchParams, type ListingFilters } from './searchParams';

describe('parseFiltersFromSearchParams', () => {
  it('returns an empty object for empty params', () => {
    expect(parseFiltersFromSearchParams(new URLSearchParams())).toEqual({});
  });

  it('parses keyword, categories, subcategories, and geohash prefix', () => {
    const params = new URLSearchParams('q=bike&loc=melbourne&cat=bicycles,furniture&sub=For+Sale::Electronics,Services::Cleaning&geo=9v6kp');
    expect(parseFiltersFromSearchParams(params)).toEqual({
      keyword: 'bike',
      location: 'melbourne',
      categories: ['bicycles', 'furniture'],
      subcategories: ['For Sale::Electronics', 'Services::Cleaning'],
      geohashPrefix: '9v6kp'
    });
  });

  it('parses partial filters (only keyword)', () => {
    const params = new URLSearchParams('q=bike');
    expect(parseFiltersFromSearchParams(params)).toEqual({ keyword: 'bike' });
  });

  it('omits empty values', () => {
    const params = new URLSearchParams('q=&cat=&geo=');
    expect(parseFiltersFromSearchParams(params)).toEqual({});
  });
});

describe('filtersToSearchParams', () => {
  it('returns empty params for empty filters', () => {
    expect(filtersToSearchParams({}).toString()).toBe('');
  });

  it('serializes a full filter set', () => {
    const filters: ListingFilters = {
      keyword: 'bike',
      location: 'melbourne',
      categories: ['bicycles', 'furniture'],
      subcategories: ['For Sale::Electronics', 'Services::Cleaning'],
      geohashPrefix: '9v6kp'
    };
    const params = filtersToSearchParams(filters);
    expect(params.get('q')).toBe('bike');
    expect(params.get('loc')).toBe('melbourne');
    expect(params.get('cat')).toBe('bicycles,furniture');
    expect(params.get('sub')).toBe('For Sale::Electronics,Services::Cleaning');
    expect(params.get('geo')).toBe('9v6kp');
  });

  it('omits undefined/empty fields', () => {
    const params = filtersToSearchParams({ keyword: 'bike' });
    expect(params.get('q')).toBe('bike');
    expect(params.has('cat')).toBe(false);
    expect(params.has('geo')).toBe(false);
  });
});

describe('round trip', () => {
  it('round-trips empty filters', () => {
    expect(parseFiltersFromSearchParams(filtersToSearchParams({}))).toEqual({});
  });

  it('round-trips a full filter set', () => {
    const filters: ListingFilters = {
      keyword: 'bike',
      location: 'melbourne',
      categories: ['bicycles', 'furniture'],
      subcategories: ['For Sale::Electronics', 'Services::Cleaning'],
      geohashPrefix: '9v6kp'
    };
    expect(parseFiltersFromSearchParams(filtersToSearchParams(filters))).toEqual(filters);
  });

  it('round-trips a partial filter set', () => {
    const filters: ListingFilters = { keyword: 'bike' };
    expect(parseFiltersFromSearchParams(filtersToSearchParams(filters))).toEqual(filters);
  });
});
