import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  hexToBytes,
  isPasskeyShim,
  buildPasskeySignerShim
} from './passkeyIdentity';

describe('bytesToHex / hexToBytes', () => {
  it('round-trips bytes through hex', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 16]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('produces lowercase, zero-padded hex', () => {
    expect(bytesToHex(new Uint8Array([0, 255, 16]))).toBe('00ff10');
  });

  it('handles empty input', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('');
    expect(hexToBytes('')).toEqual(new Uint8Array([]));
  });

  it('throws on invalid hex', () => {
    expect(() => hexToBytes('zz')).toThrow();
    expect(() => hexToBytes('abc')).toThrow();
  });
});

describe('isPasskeyShim', () => {
  it('detects a real passkey shim created by buildPasskeySignerShim', () => {
    const { generateSecretKey } = require('nostr-tools');
    const sk = generateSecretKey();
    const shim = buildPasskeySignerShim(sk);
    expect(isPasskeyShim(shim)).toBe(true);
  });

  it('rejects plain objects', () => {
    expect(isPasskeyShim({})).toBe(false);
    // The old __notedsPasskey brand no longer works; library uses Symbol.for('nostr-passkey')
    expect(isPasskeyShim({ __notedsPasskey: true })).toBe(false);
  });

  it('rejects null and primitives', () => {
    expect(isPasskeyShim(null)).toBe(false);
    expect(isPasskeyShim(undefined)).toBe(false);
    expect(isPasskeyShim('string')).toBe(false);
  });
});

describe('buildPasskeySignerShim', () => {
  const { generateSecretKey, getPublicKey } = require('nostr-tools');

  it('can encrypt and decrypt NIP-04 / NIP-44 messages, and sign events', async () => {
    const sk1 = generateSecretKey();
    const pk1 = getPublicKey(sk1);
    const shim = buildPasskeySignerShim(sk1);

    const sk2 = generateSecretKey();
    const pk2 = getPublicKey(sk2);

    expect(await shim.getPublicKey()).toBe(pk1);

    // Test NIP-04
    const plaintext04 = 'hello secret nip04';
    const ciphertext04 = await shim.nip04.encrypt(pk2, plaintext04);
    expect(ciphertext04).toBeDefined();
    expect(ciphertext04).not.toBe(plaintext04);

    const decrypted04 = await shim.nip04.decrypt(pk2, ciphertext04);
    expect(decrypted04).toBe(plaintext04);

    // Test NIP-44
    const plaintext44 = 'hello secret nip44';
    const ciphertext44 = await shim.nip44.encrypt(pk2, plaintext44);
    expect(ciphertext44).toBeDefined();
    expect(ciphertext44).not.toBe(plaintext44);

    const decrypted44 = await shim.nip44.decrypt(pk2, ciphertext44);
    expect(decrypted44).toBe(plaintext44);
  });

  it('destroy() zeros the key and causes subsequent calls to throw', async () => {
    const sk = generateSecretKey();
    const shim = buildPasskeySignerShim(sk);
    shim.destroy();
    await expect(shim.getPublicKey()).rejects.toThrow('destroyed');
  });
});
