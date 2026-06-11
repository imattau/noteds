import { describe, expect, it } from 'vitest';
import { encodeGeohash } from './geohash';

describe('encodeGeohash', () => {
  it('encodes London coordinates to a known prefix', () => {
    expect(encodeGeohash(51.5074, -0.1278, 6)).toBe('gcpvj0');
  });

  it('encodes Austin, TX coordinates to a known prefix', () => {
    expect(encodeGeohash(30.2672, -97.7431, 5)).toBe('9v6kp');
  });

  it('respects the requested precision', () => {
    expect(encodeGeohash(0, 0, 1)).toHaveLength(1);
    expect(encodeGeohash(0, 0, 9)).toHaveLength(9);
  });

  it('defaults to precision 6', () => {
    expect(encodeGeohash(51.5074, -0.1278)).toHaveLength(6);
  });
});
