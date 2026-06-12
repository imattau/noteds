import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  clearCachedBrowserArea,
  formatAreaLabel,
  getCachedBrowserArea,
  reverseGeocodeNominatim,
  searchNominatimLocations
} from './location';

describe('formatAreaLabel', () => {
  it('joins the most specific available area components', () => {
    expect(formatAreaLabel({ suburb: 'Fitzroy', city: 'Melbourne', state: 'Victoria', country: 'Australia' })).toBe(
      'Fitzroy, Melbourne, Victoria, Australia'
    );
  });

  it('skips missing parts', () => {
    expect(formatAreaLabel({ city: 'Melbourne', country: 'Australia' })).toBe('Melbourne, Australia');
  });
});

describe('browser area cache', () => {
  beforeEach(() => {
    clearCachedBrowserArea();
  });

  it('returns null when nothing is cached', () => {
    expect(getCachedBrowserArea()).toBeNull();
  });
});

describe('reverseGeocodeNominatim', () => {
  it('parses geocodejson suburb/city/state/country fields', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              geocoding: {
                label: 'Fitzroy, Melbourne, Victoria, Australia',
                suburb: 'Fitzroy',
                city: 'Melbourne',
                state: 'Victoria',
                country: 'Australia',
                postcode: '3065'
              }
            }
          }
        ]
      })
    })) as any;

    await expect(reverseGeocodeNominatim(-37.8, 144.9, fetchImpl)).resolves.toEqual({
      label: 'Fitzroy, Melbourne, Victoria, Australia',
      suburb: 'Fitzroy',
      city: 'Melbourne',
      state: 'Victoria',
      country: 'Australia',
      postcode: '3065'
    });
  });
});

describe('searchNominatimLocations', () => {
  it('parses search results into canonical suggestions', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          display_name: 'Fitzroy, Melbourne, Victoria, Australia',
          lat: '-37.799',
          lon: '144.978',
          address: {
            suburb: 'Fitzroy',
            city: 'Melbourne',
            state: 'Victoria',
            country: 'Australia',
            postcode: '3065'
          }
        }
      ]
    })) as any;

    await expect(searchNominatimLocations('Fitzroy', { fetchImpl })).resolves.toEqual([
      {
        label: 'Fitzroy, Melbourne, Victoria, Australia',
        latitude: -37.799,
        longitude: 144.978,
        geohash: expect.any(String),
        suburb: 'Fitzroy',
        city: 'Melbourne',
        state: 'Victoria',
        country: 'Australia',
        postcode: '3065'
      }
    ]);
  });
});
