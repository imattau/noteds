import { describe, expect, it } from 'vitest';
import { buildBlossomAuthEvent } from './blossom';

describe('buildBlossomAuthEvent', () => {
  it('returns a kind 24242 event with u and method tags', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    expect(event.kind).toBe(24242);
    expect(event.tags).toContainEqual(['u', 'https://blossom.example/upload']);
    expect(event.tags).toContainEqual(['method', 'PUT']);
  });

  it('includes an x tag when sha256Hex is provided', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT', 'deadbeef');
    expect(event.tags).toContainEqual(['x', 'deadbeef']);
  });

  it('omits the x tag when sha256Hex is not provided', () => {
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    expect(event.tags.find(([tag]) => tag === 'x')).toBeUndefined();
  });

  it('sets an expiration tag in the future', () => {
    const before = Math.floor(Date.now() / 1000);
    const event = buildBlossomAuthEvent('https://blossom.example/upload', 'PUT');
    const expirationTag = event.tags.find(([tag]) => tag === 'expiration');
    expect(expirationTag).toBeDefined();
    expect(Number(expirationTag?.[1])).toBeGreaterThan(before);
  });
});
