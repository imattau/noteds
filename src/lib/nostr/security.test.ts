import { describe, expect, it } from 'vitest';
import { filterSecureRelays, isSecureRelayUrl, sanitizeRelayUrl } from './security';

describe('sanitizeRelayUrl', () => {
  it('accepts wss URLs', () => {
    expect(sanitizeRelayUrl('wss://relay.example.com')).toBe('wss://relay.example.com/');
  });

  it('accepts ws URLs', () => {
    expect(sanitizeRelayUrl('ws://localhost:7777')).toBe('ws://localhost:7777/');
  });

  it('rejects non-websocket URLs', () => {
    expect(sanitizeRelayUrl('https://relay.example.com')).toBeNull();
  });

  it('rejects empty or invalid input', () => {
    expect(sanitizeRelayUrl('')).toBeNull();
    expect(sanitizeRelayUrl('not a url')).toBeNull();
    expect(sanitizeRelayUrl(undefined)).toBeNull();
  });
});

describe('isSecureRelayUrl', () => {
  it('returns true for valid relay urls', () => {
    expect(isSecureRelayUrl('wss://relay.example.com')).toBe(true);
  });

  it('returns false for invalid urls', () => {
    expect(isSecureRelayUrl('ftp://example.com')).toBe(false);
  });
});

describe('filterSecureRelays', () => {
  it('filters out invalid urls and normalizes valid ones', () => {
    expect(filterSecureRelays(['wss://a.com', 'bad', 'ws://b.com'])).toEqual([
      'wss://a.com/',
      'ws://b.com/'
    ]);
  });
});
