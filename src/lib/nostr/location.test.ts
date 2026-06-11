import { describe, expect, it, vi, beforeEach } from 'vitest';
import { clearCachedBrowserArea, formatAreaLabel, getCachedBrowserArea, reverseGeocodeNominatim } from './location';

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
