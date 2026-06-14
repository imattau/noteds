import { describe, expect, it } from 'vitest';
import { buildDirectMessageEvent, decryptDM } from './dm';
import type { NostrEvent } from 'nostr-tools';

describe('buildDirectMessageEvent', () => {
  it('returns a kind 4 event with a p tag for the recipient', () => {
    const event = buildDirectMessageEvent('recipient-pubkey', 'encrypted-content');
    expect(event.kind).toBe(4);
    expect(event.tags).toContainEqual(['p', 'recipient-pubkey']);
    expect(event.content).toBe('encrypted-content');
  });

  it('sets created_at to a recent timestamp', () => {
    const before = Math.floor(Date.now() / 1000);
    const event = buildDirectMessageEvent('recipient-pubkey', 'ciphertext');
    expect(event.created_at).toBeGreaterThanOrEqual(before);
  });

  it('includes extra tags if provided', () => {
    const event = buildDirectMessageEvent('recipient-pubkey', 'ciphertext', [
      ['client', 'noteds'],
      ['a', 'coordinate']
    ]);
    expect(event.tags).toContainEqual(['p', 'recipient-pubkey']);
    expect(event.tags).toContainEqual(['client', 'noteds']);
    expect(event.tags).toContainEqual(['a', 'coordinate']);
  });
});
