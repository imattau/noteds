import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RELAYS, getActiveRelays, getCustomRelays, setCustomRelays } from './relays';

describe('DEFAULT_RELAYS', () => {
  it('has at least 4 entries, all ws/wss', () => {
    expect(DEFAULT_RELAYS.length).toBeGreaterThanOrEqual(4);
    for (const url of DEFAULT_RELAYS) {
      expect(url).toMatch(/^wss?:\/\//);
    }
  });
});

describe('getCustomRelays', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns [] when nothing stored', () => {
    expect(getCustomRelays()).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    localStorage.setItem('noteds:custom-relays', 'not json');
    expect(getCustomRelays()).toEqual([]);
  });
});

describe('setCustomRelays / getCustomRelays round trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips valid relay URLs', () => {
    setCustomRelays(['wss://my.relay.example']);
    expect(getCustomRelays()).toEqual(['wss://my.relay.example/']);
  });

  it('filters out invalid URLs', () => {
    setCustomRelays(['wss://good.example', 'not-a-url', 'https://bad.example']);
    expect(getCustomRelays()).toEqual(['wss://good.example/']);
  });
});

describe('getActiveRelays', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('merges custom and default relays without duplicates', () => {
    setCustomRelays([DEFAULT_RELAYS[0], 'wss://extra.example']);
    const active = getActiveRelays();
    expect(active).toContain('wss://extra.example/');
    expect(active.filter((relay) => relay === DEFAULT_RELAYS[0]).length).toBe(1);
    for (const url of DEFAULT_RELAYS) {
      expect(active).toContain(url);
    }
  });

  it('returns just the defaults when no custom relays are set', () => {
    expect(getActiveRelays()).toEqual(DEFAULT_RELAYS);
  });
});
