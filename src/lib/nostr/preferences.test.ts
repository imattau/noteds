import { RelayPool } from 'applesauce-relay';
import { EventStore } from 'applesauce-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import * as preferences from './preferences';
import {
  DEFAULT_BLOSSOM_SERVERS,
  filterSecureBlossomServers,
  getCustomBlossomServers,
  parseBlossomServerListEvent,
  parseRelayListEvent,
  sanitizeBlossomServerUrl,
  setCustomBlossomServers
} from './preferences';
import { getCustomRelays } from './relays';

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

describe('nostr preference hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('replaces local fallbacks with Nostr relay and blossom preferences when available', async () => {
    vi.spyOn(EventStore.prototype as any, 'verifyEvent' as any).mockReturnValue(true as any);
    setCustomBlossomServers(['https://local.example/']);
    localStorage.setItem('noteds:custom-relays', JSON.stringify(['wss://local.example/']));

    vi.spyOn(RelayPool.prototype as any, 'request' as any).mockImplementation((...args: any[]) => {
      const filter = args[1];
      if (filter.kinds?.[0] === 10002) {
        return of({
          kind: 10002,
          content: '',
          created_at: 1,
          pubkey: 'a'.repeat(64),
          id: 'b'.repeat(64),
          sig: 'c'.repeat(128),
          tags: [['r', 'wss://relay.example']]
        }) as any;
      }

      if (filter.kinds?.[0] === 10096) {
        return of({
          kind: 10096,
          content: '',
          created_at: 1,
          pubkey: 'a'.repeat(64),
          id: 'd'.repeat(64),
          sig: 'e'.repeat(128),
          tags: [['server', 'https://blossom.example']]
        }) as any;
      }

      return of() as any;
    });

    await preferences.hydratePreferencesFromNostr('a'.repeat(64));

    expect(getCustomRelays()).toEqual(['wss://relay.example/']);
    expect(preferences.getCustomBlossomServers()).toEqual(['https://blossom.example/']);
  });
});
