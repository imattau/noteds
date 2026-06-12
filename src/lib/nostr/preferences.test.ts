import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BLOSSOM_SERVERS,
  filterSecureBlossomServers,
  getCustomBlossomServers,
  parseBlossomServerListEvent,
  parseRelayListEvent,
  sanitizeBlossomServerUrl,
  setCustomBlossomServers
} from './preferences';

describe('relay preference parsing', () => {
  it('extracts secure relay urls from r tags', () => {
    expect(
      parseRelayListEvent({
        kind: 10002,
        content: '',
        created_at: 1,
        pubkey: 'a'.repeat(64),
        id: 'b'.repeat(64),
        sig: 'c'.repeat(128),
        tags: [
          ['r', 'wss://relay.example'],
          ['r', 'http://bad.example'],
          ['r', 'wss://other.example', 'write']
        ]
      })
    ).toEqual(['wss://relay.example/', 'wss://other.example/']);
  });
});

describe('blossom preference parsing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sanitizes https blossom server urls', () => {
    expect(sanitizeBlossomServerUrl('https://blossom.example')).toBe('https://blossom.example/');
    expect(sanitizeBlossomServerUrl('http://blossom.example')).toBeNull();
  });

  it('extracts server tags from a blossom server list event', () => {
    expect(
      parseBlossomServerListEvent({
        kind: 10096,
        content: '',
        created_at: 1,
        pubkey: 'a'.repeat(64),
        id: 'b'.repeat(64),
        sig: 'c'.repeat(128),
        tags: [
          ['server', 'https://blossom.example'],
          ['server', 'http://bad.example'],
          ['server', 'https://upload.example']
        ]
      })
    ).toEqual(['https://blossom.example/', 'https://upload.example/']);
  });

  it('round-trips custom blossom servers', () => {
    setCustomBlossomServers(['https://blossom.example', 'http://bad.example', 'https://upload.example']);
    expect(getCustomBlossomServers()).toEqual(['https://blossom.example/', 'https://upload.example/']);
  });

  it('falls back to defaults when custom blossom servers are absent', () => {
    expect(getCustomBlossomServers()).toEqual([]);
    expect(DEFAULT_BLOSSOM_SERVERS[0]).toBe('https://blossom.primal.net');
    expect(filterSecureBlossomServers(['https://blossom.example', 'http://bad.example'])).toEqual([
      'https://blossom.example/'
    ]);
  });
});
