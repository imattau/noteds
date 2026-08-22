import { describe, expect, it } from 'vitest';
import { decodeGeohash, distanceKm, encodeGeohash } from './geohash';

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

  it('decodes a valid geohash near the original coordinates', () => {
    const center = decodeGeohash('9v6kp');
    expect(center?.latitude).toBeCloseTo(30.2672, 0);
    expect(center?.longitude).toBeCloseTo(-97.7431, 0);
  });

  it('returns a finite distance between decoded cells', () => {
    const london = decodeGeohash('gcpvj0');
    const austin = decodeGeohash('9v6kp');
    expect(london && austin ? distanceKm(london, austin) : NaN).toBeGreaterThan(7_000);
  });
});
