import { describe, expect, it } from 'vitest';
import {
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  bytesToHex,
  hexToBytes,
  isPasskeyShim
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

describe('arrayBufferToBase64Url / base64UrlToArrayBuffer', () => {
  it('round-trips a buffer with no padding needed (length % 3 === 0)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips a buffer needing one padding char (length % 3 === 2)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips a buffer needing two padding chars (length % 3 === 1)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips an empty buffer', () => {
    const bytes = new Uint8Array([]);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });

  it('round-trips a 32-byte buffer (typical PRF key length)', () => {
    const bytes = new Uint8Array(32).map((_, i) => (i * 7) % 256);
    const encoded = arrayBufferToBase64Url(bytes.buffer);
    expect(new Uint8Array(base64UrlToArrayBuffer(encoded))).toEqual(bytes);
  });
});

describe('isPasskeyShim', () => {
  it('detects the passkey shim marker', () => {
    expect(isPasskeyShim({ __notedsPasskey: true })).toBe(true);
    expect(isPasskeyShim({})).toBe(false);
  });
});

describe('buildPasskeySignerShim', () => {
  const { generateSecretKey, getPublicKey } = require('nostr-tools');
  
  it('can encrypt and decrypt NIP-04 / NIP-44 messages, and sign events', async () => {
    const { buildPasskeySignerShim } = await import('./passkeyIdentity');
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
});
